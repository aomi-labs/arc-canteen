/** The staging Task API's two independently purchased x402 stages. No Task or execution signature is created here. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import { arcNetwork, verifyArcGatewaySettlement, type ArcChainId, type CircleGatewaySettlement } from "@arc-canteen/circle-arc-wallet";
import { verifyAttestation, type TaskRequest } from "./index.ts";
import { withStateLock } from "./lock.ts";

type Json = Record<string, any>;
type Stage = "preparation" | "retrieval";
type Quote = { header: string; required: Json; accepted: Json; amount: string; nonce: string };
type Payment = { quote: Quote; authorization: Json; signature: string; proof: string; receipt?: Json; settlement?: CircleGatewaySettlement };
type Job = { quoteId: string; retrievalToken: string; statusUrl: string; resultUrl: string };
type Preview = { quoteId: string; requestHash: string; request: Json; payloadHash: string; summary: Json; pricing: Json; expiresAt: number; paymentRequired: string | null; attestation: string };
type Journal = { version: 2; policy: Json; request: TaskRequest; requestHash: string; preparation?: Payment; job?: Job; preview?: Preview; retrieval?: Payment; artifact?: string };

export type TwoStageApproval = {
  stage: Stage;
  chainId: ArcChainId;
  payer: string;
  merchant: string;
  amountMicrousd: bigint;
  intent: string;
  summary?: Json;
  pricing?: Json;
};

export type TwoStageOptions = {
  endpoint: string;
  chainId: ArcChainId;
  payer: string;
  merchant: string;
  stateDirectory: string;
  trustedJwks: { keys: Record<string, unknown>[] };
  maxRetrievalMicrousd: bigint;
  approve: (review: TwoStageApproval) => Promise<boolean> | boolean;
  signTypedData: (data: unknown) => Promise<string>;
  fetch?: typeof fetch;
  gatewayFetch?: typeof fetch;
  rpcUrl?: string;
  rpcFetch?: typeof fetch;
  now?: () => number;
};

const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
    : item,
);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function address(value: unknown) {
  check(typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value), "Invalid Arc address");
  return value.toLowerCase();
}
function object(value: unknown, name: string): Json {
  check(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value as Json;
}
function decimal(value: unknown) {
  check(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), "Invalid integer amount");
  return BigInt(value);
}
function decode(header: string) {
  check(/^[A-Za-z0-9+/]+={0,2}$/.test(header) && header.length <= 32_768, "Invalid x402 header");
  return object(JSON.parse(Buffer.from(header, "base64").toString("utf8")), "x402 requirement");
}

/** Mirrors the server's canonical request, so preparation and attestation bind the exact input. */
export function canonicalTaskRequest(request: TaskRequest) {
  const source = request.constraints ?? null;
  const constraints = source == null ? null : {
    maxOutgoingUsdcWei: source.maxOutgoingUsdcWei ?? null,
    maxGasUnits: source.maxGasUnits == null ? null : String(source.maxGasUnits),
    allowedTargets: ((source.allowedTargets ?? []) as string[]).map(address),
    minimumReceived: ((source.minimumReceived ?? []) as Json[]).map((item) => ({
      asset: item.asset === "native" ? "native" : address(item.asset), amount: String(item.amount),
    })),
  };
  return {
    executionKind: request.executionKind ?? "eoa_transactions",
    transactionSafetyMode: request.transactionSafetyMode ?? null,
    intent: request.intent,
    chainId: String(request.chainId),
    sender: address(request.sender),
    payer: address(request.payer ?? request.sender),
    calls: (request.calls ?? []).map((call) => ({ to: address(call.to), data: call.data.toLowerCase(), value: call.value })),
    constraints,
  };
}

export class TwoStageTaskClient {
  readonly #options: TwoStageOptions;
  readonly #endpoint: URL;

  constructor(options: TwoStageOptions) {
    const endpoint = new URL(options.endpoint);
    check(endpoint.pathname === "/v1/task/build" && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password &&
      (endpoint.protocol === "https:" || (endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))),
    "Use an explicit Task build endpoint");
    arcNetwork(options.chainId);
    address(options.payer);
    address(options.merchant);
    check(options.maxRetrievalMicrousd > 0n, "Set a positive retrieval cap");
    if (options.chainId === 5042) check(Boolean(options.rpcUrl), "Arc Mainnet requires independent settlement verification");
    this.#options = options;
    this.#endpoint = endpoint;
  }

  now() { return this.#options.now?.() ?? Math.floor(Date.now() / 1000); }
  private file() { return path.join(this.#options.stateDirectory, "two-stage.json"); }
  private async read(): Promise<Journal | undefined> {
    try {
      const info = await lstat(this.file());
      check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && (info.mode & 0o077) === 0, "Task journal must be a private regular file");
      const journal = JSON.parse(await readFile(this.file(), "utf8"));
      check(journal.version === 2, "Task journal belongs to another protocol version");
      return journal;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  private async save(journal: Journal) {
    const temporary = `${this.file()}.${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(journal)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, this.file());
    const directory = await open(this.#options.stateDirectory, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  private async withJournal<T>(operation: () => Promise<T>) {
    return withStateLock(this.#options.stateDirectory, "two-stage-lock", operation);
  }
  private async post(url: URL, body: unknown, proof?: string) {
    check(url.origin === this.#endpoint.origin && (url.pathname === this.#endpoint.pathname || url.pathname.startsWith("/v1/task/")), "Task URL left the trusted origin");
    const response = await (this.#options.fetch ?? fetch)(url, {
      method: "POST", headers: { "content-type": "application/json", ...(proof ? { "payment-signature": proof } : {}) },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error("Task response exceeded 4 MiB; retain the original proof"); }
      chunks.push(item.value);
    }
    return { response, bytes: Buffer.concat(chunks) };
  }
  private quote(header: string, url: URL, stage: Stage, expectedHash: string, expectedAmount?: bigint): Quote {
    const required = decode(header);
    check(required.x402Version === 2 && Array.isArray(required.accepts) && required.accepts.length === 1, "Unexpected x402 offers");
    check(required.resource?.url === url.href && required.resource?.mimeType === "application/json", "Payment resource differs from requested Task URL");
    check(required.extensions?.aomiTask?.payloadHash === expectedHash &&
      required.extensions.aomiTask.quoteId === (stage === "preparation" ? "preparation" : url.pathname.split("/")[3]),
    "Payment requirement is not bound to this Task stage");
    const accepted = object(required.accepts[0], "Arc payment offer");
    const network = arcNetwork(this.#options.chainId);
    check(accepted.scheme === "exact" && accepted.network === `eip155:${this.#options.chainId}` &&
      address(accepted.asset) === network.usdc && address(accepted.payTo) === address(this.#options.merchant),
    "Wrong payment scheme, network, asset, or merchant");
    check(accepted.extra?.name === "GatewayWalletBatched" && accepted.extra?.version === "1" &&
      address(accepted.extra.verifyingContract) === network.gatewayWallet &&
      Number.isSafeInteger(accepted.extra.minValiditySeconds) && accepted.extra.minValiditySeconds > 0 && accepted.extra.minValiditySeconds <= 691_140 &&
      Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 && accepted.maxTimeoutSeconds <= 300,
    "Unsupported Gateway domain or validity");
    const amount = decimal(accepted.amount);
    check(amount === (stage === "preparation" ? 10_000n : expectedAmount) &&
      (stage === "preparation" || amount <= this.#options.maxRetrievalMicrousd), "Payment amount exceeds the reviewed stage cap");
    return { header, required, accepted, amount: amount.toString(), nonce: `0x${randomBytes(32).toString("hex")}` };
  }
  private async sign(quote: Quote, stage: Stage, request: TaskRequest, preview?: Preview): Promise<Payment> {
    const approved = await this.#options.approve({ stage, chainId: this.#options.chainId,
      payer: address(this.#options.payer), merchant: address(this.#options.merchant), amountMicrousd: BigInt(quote.amount),
      intent: request.intent, summary: preview?.summary, pricing: preview?.pricing });
    check(approved, `${stage} purchase rejected by reviewer`);
    const now = this.now();
    const validBefore = Math.min(now + 691_200, (preview?.expiresAt ?? now + 300) + quote.accepted.extra.minValiditySeconds + 60);
    const authorization = { from: address(this.#options.payer), to: address(this.#options.merchant),
      value: quote.amount, validAfter: String(Math.max(0, now - 60)), validBefore: String(validBefore), nonce: quote.nonce };
    const signature = await this.#options.signTypedData({
      domain: { name: "GatewayWalletBatched", version: "1", chainId: this.#options.chainId,
        verifyingContract: arcNetwork(this.#options.chainId).gatewayWallet },
      types: { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ] }, primaryType: "TransferWithAuthorization",
      message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
    });
    check(/^0x[0-9a-f]{130}$/i.test(signature), "Invalid Gateway signature");
    const proof = Buffer.from(JSON.stringify({ x402Version: 2, accepted: quote.accepted,
      resource: quote.required.resource, payload: { signature, authorization } })).toString("base64");
    return { quote, authorization, signature, proof };
  }
  private receipt(response: Response, payment: Payment) {
    const header = response.headers.get("payment-response");
    if (!header) return;
    const receipt = decode(header);
    check(receipt.success === true && receipt.network === `eip155:${this.#options.chainId}` &&
      address(receipt.payer) === address(this.#options.payer) && typeof receipt.transaction === "string" && receipt.transaction.length > 0,
    "Payment receipt differs from selected Arc payer or network");
    payment.receipt = receipt;
  }
  private verifyPreview(preview: Preview, state: Journal, stored = false) {
    check(state.job, "Task job is missing");
    let attestedAt = this.now();
    if (stored) {
      const parts = preview.attestation.split(".");
      check(parts.length === 3, "Stored Task attestation is malformed");
      const claims = object(JSON.parse(Buffer.from(parts[1], "base64url").toString()), "Stored Task attestation");
      check(Number.isSafeInteger(claims.iat) && claims.iat <= this.now() + 30, "Stored Task attestation issue time is invalid");
      attestedAt = claims.iat;
    }
    const claims = verifyAttestation(preview.attestation, this.#options.trustedJwks,
      `wallet:eip155:${this.#options.chainId}:${address(this.#options.payer)}`, attestedAt);
    check(preview.quoteId === state.job.quoteId && preview.quoteId === claims.quoteId &&
      preview.requestHash === state.requestHash && claims.requestHash === state.requestHash &&
      stable(preview.request) === stable(canonicalTaskRequest(state.request)) && stable(claims.request) === stable(preview.request) &&
      stable(preview.summary) === stable(claims.summary) && stable(preview.pricing) === stable(claims.pricing) &&
      preview.payloadHash === claims.payloadHash && /^[0-9a-f]{64}$/.test(preview.payloadHash) &&
      preview.expiresAt === claims.exp && Number(claims.chainId) === this.#options.chainId &&
      address(claims.payer) === address(this.#options.payer), "Task preview differs from trusted attestation");
    const amount = decimal(preview.pricing.fee_microusd);
    check(amount <= this.#options.maxRetrievalMicrousd &&
      typeof claims.amountMicrousd === "string" && decimal(claims.amountMicrousd) === amount,
    "Retrieval fee exceeds cap or signed amount");
    check(claims.paymentRequiredHash === sha256(preview.paymentRequired ?? ""),
      "Task preview payment requirement differs from attestation");
    if (amount > 0n) {
      check(preview.paymentRequired, "Paid retrieval preview has no x402 requirement");
      this.quote(preview.paymentRequired, new URL(state.job.resultUrl), "retrieval", preview.payloadHash, amount);
    }
    return amount;
  }
  private async settle(payment: Payment) {
    if (this.#options.chainId !== 5042 || !payment.receipt) return;
    const settlement = await verifyArcGatewaySettlement({ chainId: 5042, rpcUrl: this.#options.rpcUrl!,
      nonce: payment.quote.nonce, transferId: payment.receipt.transaction, payer: this.#options.payer,
      merchant: this.#options.merchant, amountMicrousd: payment.quote.amount },
    { gatewayFetch: this.#options.gatewayFetch, rpcFetch: this.#options.rpcFetch });
    payment.settlement = settlement;
  }
  private job(value: Json): Job {
    check(typeof value.quoteId === "string" && /^[0-9a-f-]{36}$/i.test(value.quoteId) &&
      typeof value.retrievalToken === "string" && value.retrievalToken.length >= 32, "Invalid private Task job capability");
    const expected = new URL(`/v1/task/${value.quoteId}/`, this.#endpoint.origin);
    const statusUrl = new URL(value.statusUrl);
    const resultUrl = new URL(value.resultUrl);
    check(statusUrl.href === new URL("status", expected).href && resultUrl.href === new URL("result", expected).href,
      "Task job URLs left the trusted origin or quote");
    return { quoteId: value.quoteId, retrievalToken: value.retrievalToken, statusUrl: statusUrl.href, resultUrl: resultUrl.href };
  }
  private async load(request?: TaskRequest) {
    try {
      await lstat(path.join(this.#options.stateDirectory, "state.json"));
      throw new Error("Legacy Task purchase journal exists; use a fresh private directory for the two-stage protocol");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let state = await this.read();
    const policy = { endpoint: this.#endpoint.href, chainId: this.#options.chainId,
      payer: address(this.#options.payer), merchant: address(this.#options.merchant),
      maxRetrievalMicrousd: this.#options.maxRetrievalMicrousd.toString() };
    if (request) {
      check(request.chainId === this.#options.chainId && address(request.payer ?? request.sender) === address(this.#options.payer), "Wrong Task chain or payer");
      const canonical = canonicalTaskRequest(request);
      const encoded = canonicalize(canonical);
      check(encoded, "Task request cannot be canonicalized");
      const requestHash = sha256(encoded);
      if (!state) { state = { version: 2, policy, request, requestHash }; await this.save(state); }
      check(state.requestHash === requestHash && stable(canonicalTaskRequest(state.request)) === stable(canonical),
        "Task request differs from private journal; use its original request and payment proofs");
    }
    check(state, "No prepared Task journal");
    check(stable(state.policy) === stable(policy), "Task payment policy differs from private journal");
    check(state.request.chainId === this.#options.chainId && address(state.request.payer ?? state.request.sender) === address(this.#options.payer),
      "Task journal belongs to another Arc payer or chain");
    if (state.preparation) this.verifyStoredPayment(state.preparation, "preparation", this.#endpoint, state.requestHash, 10_000n);
    if (state.retrieval) {
      check(state.job && state.preview, "Stored retrieval has no original attested job");
      const amount = this.verifyPreview(state.preview, state, true);
      this.verifyStoredPayment(state.retrieval, "retrieval", new URL(state.job.resultUrl), state.preview.payloadHash, amount);
    }
    return state;
  }
  private verifyStoredPayment(payment: Payment, stage: Stage, url: URL, expectedHash: string, amount: bigint) {
    const quote = this.quote(payment.quote.header, url, stage, expectedHash, amount);
    check(stable(quote.required) === stable(payment.quote.required) &&
      stable(quote.accepted) === stable(payment.quote.accepted) && quote.amount === payment.quote.amount &&
      /^0x[0-9a-f]{64}$/i.test(payment.quote.nonce), "Stored Task requirement differs from its signed stage");
    const authorization = payment.authorization;
    check(address(authorization.from) === address(this.#options.payer) &&
      address(authorization.to) === address(this.#options.merchant) &&
      authorization.value === quote.amount && authorization.nonce === payment.quote.nonce &&
      decimal(authorization.validBefore) > decimal(authorization.validAfter) &&
      /^0x[0-9a-f]{130}$/i.test(payment.signature), "Stored Task authorization differs from payment policy");
    const wire = object(JSON.parse(Buffer.from(payment.proof, "base64").toString()), "Stored x402 proof");
    check(wire.x402Version === 2 && stable(wire.accepted) === stable(quote.accepted) &&
      stable(wire.resource) === stable(quote.required.resource) &&
      stable(wire.payload?.authorization) === stable(authorization) && wire.payload.signature === payment.signature,
      "Stored x402 proof differs from its durable authorization");
  }
  /** Pay only the fixed preparation attempt. A pending result must be resumed with this same journal. */
  async prepare(request: TaskRequest): Promise<{ status: "pending" } | { status: "prepared"; quoteId: string }> {
    return this.withJournal(async () => {
      const state = await this.load(request);
      if (state.job) return { status: "prepared", quoteId: state.job.quoteId };
      if (!state.preparation) {
        const unpaid = await this.post(this.#endpoint, request);
        check(unpaid.response.status === 402, `Expected preparation challenge, got HTTP ${unpaid.response.status}`);
        const body = object(JSON.parse(unpaid.bytes.toString()), "Preparation challenge");
        const header = unpaid.response.headers.get("payment-required");
        check(header && body.paymentRequired === header && body.stage === "preparation" && body.amountMicrousd === "10000", "Preparation body and header differ");
        const quote = this.quote(header, this.#endpoint, "preparation", state.requestHash);
        state.preparation = await this.sign(quote, "preparation", request);
        await this.save(state);
      }
      const paid = await this.post(this.#endpoint, state.request, state.preparation.proof);
      check([202, 402].includes(paid.response.status), `Preparation returned HTTP ${paid.response.status}; retain signed proof`);
      if (paid.response.status === 402) return { status: "pending" };
      const body = object(JSON.parse(paid.bytes.toString()), "Prepared Task job");
      state.job = this.job(body);
      this.receipt(paid.response, state.preparation);
      await this.save(state);
      return { status: "prepared", quoteId: state.job.quoteId };
    });
  }
  /** Polling is free. A ready response is verified against the paid request and trusted seller JWKS. */
  async status(): Promise<{ status: "pending" | "failed" | "ready"; preview?: Preview }> {
    return this.withJournal(async () => {
      const state = await this.load();
      check(state.job, "Preparation has not returned a private job capability");
      const call = await this.post(new URL(state.job.statusUrl), { retrievalToken: state.job.retrievalToken });
      check([200, 202].includes(call.response.status), `Task status returned HTTP ${call.response.status}`);
      const body = object(JSON.parse(call.bytes.toString()), "Task status");
      check(body.quoteId === state.job.quoteId, "Task status returned a different quote");
      if (state.preparation) this.receipt(call.response, state.preparation);
      if (state.preparation?.receipt) await this.settle(state.preparation);
      if (body.status === "failed" || body.status === "expired") { await this.save(state); return { status: "failed" }; }
      if (body.status !== "ready") { await this.save(state); return { status: "pending" }; }
      if (body.purchased === true && state.preview && state.artifact) {
        await this.save(state);
        return { status: "ready", preview: state.preview };
      }
      const header = call.response.headers.get("payment-required");
      check(body.paymentRequired === header, "Task preview body and payment header differ");
      this.verifyPreview(body as Preview, state);
      state.preview = body as Preview;
      await this.save(state);
      return { status: "ready", preview: state.preview };
    });
  }
  /** Buy the frozen bytes with a second signature; zero-outflow results need no second payment. */
  async retrieve(): Promise<{ status: "pending" } | { status: "complete"; bytes: Buffer; preview: Preview; preparationReceipt?: Json; retrievalReceipt?: Json }> {
    return this.withJournal(async () => {
      const state = await this.load();
      check(state.job && state.preview && state.preparation, "Poll for an attested ready preview first");
      check(state.preparation.receipt, "Preparation has no accepted payment receipt; poll the same job");
      if (this.#options.chainId === 5042) check(state.preparation.settlement?.status === "confirmed", "Preparation settlement is not independently confirmed");
      const preview = state.preview;
      const amount = decimal(preview.pricing.fee_microusd);
      if (!state.artifact && amount === 0n) this.verifyPreview(preview, state);
      if (!state.artifact && amount > 0n && !state.retrieval) {
        this.verifyPreview(preview, state);
        check(preview.expiresAt > this.now() + 30, "Retrieval quote expires too soon; poll the same job again");
        const quote = this.quote(preview.paymentRequired!, new URL(state.job.resultUrl), "retrieval", preview.payloadHash, amount);
        state.retrieval = await this.sign(quote, "retrieval", state.request, preview);
        await this.save(state);
      }
      if (!state.artifact) {
        const paid = await this.post(new URL(state.job.resultUrl), { retrievalToken: state.job.retrievalToken }, state.retrieval?.proof);
        if (paid.response.status === 202) return { status: "pending" };
        check(paid.response.status === 200, `Retrieval returned HTTP ${paid.response.status}; retain original proof`);
        check(sha256(paid.bytes) === preview.payloadHash, "Frozen Task bytes differ from attested hash");
        if (state.retrieval) this.receipt(paid.response, state.retrieval);
        if (amount > 0n) check(state.retrieval?.receipt, "Paid retrieval has no accepted payment receipt; retain signed proof");
        state.artifact = paid.bytes.toString("base64");
        await this.save(state);
      }
      if (state.retrieval?.receipt) { await this.settle(state.retrieval); await this.save(state); }
      if (this.#options.chainId === 5042 && amount > 0n)
        check(state.retrieval?.settlement?.status === "confirmed", "Retrieval settlement is not independently confirmed; resume this journal");
      const bytes = Buffer.from(state.artifact, "base64");
      check(sha256(bytes) === preview.payloadHash, "Stored Task bytes differ from attested hash");
      return { status: "complete", bytes, preview, preparationReceipt: state.preparation.receipt, retrievalReceipt: state.retrieval?.receipt };
    });
  }
}
