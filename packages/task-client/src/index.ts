/** Purchases immutable Task API bytes. It never signs or submits the resulting execution actions. */
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import type { JsonWebKey as NodeJsonWebKey } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import { hashTypedData, keccak256, stringToHex } from "viem";
import {
  ARC_TESTNET_CHAIN_ID,
  CircleArcWallet,
  verifyArcTransferReceipt,
  type ArcReceipt,
  type CircleCommandReview,
  type CircleTransferResult,
} from "@arc-canteen/circle-arc-wallet";

export type TaskRequest = {
  executionKind?: "eoa_transactions" | "smart_account_calls";
  transactionSafetyMode?: string | null;
  intent: string;
  chainId: number;
  sender: string;
  payer?: string;
  calls?: readonly SmartAccountCall[];
  constraints?: Record<string, unknown> | null;
};

export type TaskClientOptions = {
  endpoint: string;
  payer: string;
  recipient: string;
  maxFeeMicrousd: bigint;
  trustedJwks: { keys: Record<string, unknown>[] };
  stateDirectory: string;
  signTypedData: (data: unknown) => Promise<string>;
  idempotencyKey?: () => string;
  fetch?: typeof fetch;
  now?: () => number;
};

export type TaskPurchaseResult =
  | { status: "complete"; bytes: Buffer; receipt: unknown }
  | { status: "pending" };

export type TaskQuotePreview = {
  quoteId: string;
  requestHash: string;
  payloadHash: string;
  summary: Record<string, unknown>;
  pricing: Record<string, unknown>;
  expiresAt: number;
};

const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY = "0x0077777d7eba4688bdef3e311b846f25870a19b9";
const TASK_RESOURCE = "https://chat.aomi.dev/v1/task";
const TASK_ENDPOINT = "/v1/task/build";
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function address(value: unknown): string {
  requireThat(typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value), "Invalid address");
  return value.toLowerCase();
}

function decimal(value: unknown): bigint {
  requireThat(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), "Expected unsigned decimal string");
  return BigInt(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalized(request: TaskRequest, idempotencyKey?: string) {
  const source = request.constraints ?? {};
  const constraints = request.constraints == null ? null : {
    maxOutgoingUsdcWei: null,
    maxGasUnits: null,
    ...source,
    allowedTargets: ((source.allowedTargets ?? []) as string[]).map(address),
    minimumReceived: ((source.minimumReceived ?? []) as Array<Record<string, unknown>>).map((entry) => ({
      ...entry,
      asset: entry.asset === "native" ? "native" : address(entry.asset),
    })),
  };
  return {
    executionKind: request.executionKind ?? "eoa_transactions",
    transactionSafetyMode: request.transactionSafetyMode ?? null,
    intent: request.intent,
    chainId: String(request.chainId),
    sender: address(request.sender),
    payer: address(request.payer ?? request.sender),
    calls: (request.calls ?? []).map((call) => ({
      to: address(call.to),
      data: call.data.toLowerCase(),
      value: decimal(call.value).toString(),
    })),
    constraints: constraints == null ? null : {
      ...constraints,
      maxGasUnits: constraints.maxGasUnits == null ? null : String(constraints.maxGasUnits),
    },
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
}

const TASK_TYPES = {
  TaskAuthorization: [
    { name: "endpoint", type: "string" },
    { name: "requestHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "sender", type: "address" },
    { name: "payer", type: "address" },
    { name: "idempotencyKey", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export function taskAuthorizationData(request: TaskRequest, idempotencyKey: string, issuedAt: number, expiresAt = issuedAt + 300) {
  requireThat(Number.isSafeInteger(issuedAt) && Number.isSafeInteger(expiresAt) && expiresAt > issuedAt && expiresAt - issuedAt <= 300, "Task authorization must live for at most five minutes");
  const canonical = (canonicalize as unknown as (value: unknown) => string | undefined)(normalized(request, idempotencyKey));
  requireThat(canonical, "Task request is not canonicalizable");
  const requestHash = keccak256(stringToHex(canonical));
  const sender = address(request.sender) as `0x${string}`;
  const payer = address(request.payer ?? request.sender) as `0x${string}`;
  const typedData = {
    domain: {
      name: "Aomi Task API",
      version: "1",
      chainId: request.chainId,
      salt: keccak256(stringToHex(TASK_RESOURCE)),
    },
    types: TASK_TYPES,
    primaryType: "TaskAuthorization" as const,
    message: {
      endpoint: TASK_ENDPOINT,
      requestHash,
      chainId: BigInt(request.chainId),
      sender,
      payer,
      idempotencyKey,
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt),
    },
  };
  return { canonical, requestHash, digest: hashTypedData(typedData), typedData };
}

function walletPrincipal(request: TaskRequest) {
  return `wallet:eip155:${request.chainId}:${address(request.sender)}`;
}

export function verifyAttestation(
  jwt: string,
  jwks: TaskClientOptions["trustedJwks"],
  subject: string,
  now: number,
): Record<string, unknown> {
  const parts = jwt.split(".");
  requireThat(parts.length === 3, "Invalid attestation");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
  requireThat(
    header.alg === "EdDSA" && typeof header.kid === "string" && !header.jku && !header.jwk && !header.x5u && !header.crit,
    "Unsupported attestation header",
  );
  const keys = jwks.keys.filter((key) =>
    key.kid === header.kid && key.kty === "OKP" && key.crv === "Ed25519" &&
    (!key.alg || key.alg === "EdDSA") && (!key.use || key.use === "sig"));
  requireThat(keys.length === 1, "No unique explicitly trusted signing key");
  requireThat(
    verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: keys[0] as NodeJsonWebKey, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    ),
    "Invalid attestation signature",
  );
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  requireThat(
    claims.aud === "aomi-task-artifact" && claims.sub === subject && Number.isSafeInteger(claims.iat) &&
    Number.isSafeInteger(claims.exp) && Number(claims.iat) <= now + 30 && Number(claims.exp) > now &&
    Number(claims.exp) > Number(claims.iat),
    "Invalid attestation identity or lifetime",
  );
  return claims;
}

export function validateQuote(
  quote: Record<string, any>,
  requiredHeader: string,
  request: TaskRequest,
  options: TaskClientOptions,
  now: number,
) {
  const claims = verifyAttestation(quote.attestation, options.trustedJwks, walletPrincipal(request), now) as Record<string, any>;
  requireThat(typeof claims.request?.idempotencyKey === "string", "Signed request has no idempotency key");
  const canonical = (canonicalize as unknown as (value: unknown) => string | undefined)(normalized(request, claims.request.idempotencyKey));
  requireThat(canonical, "Task request is not canonicalizable");
  const requestHash = keccak256(stringToHex(canonical)).slice(2);
  requireThat(typeof quote.quoteId === "string" && /^[0-9a-f-]{36}$/i.test(quote.quoteId) && typeof quote.retrievalToken === "string" && quote.retrievalToken.length >= 32, "Invalid quote capability");
  requireThat(/^[0-9a-f]{64}$/.test(quote.payloadHash) && claims.quoteId === quote.quoteId && claims.payloadHash === quote.payloadHash && claims.requestHash === quote.requestHash && quote.requestHash === requestHash && /^[0-9a-f]{64}$/.test(quote.requestHash), "Quote hash binding mismatch");
  requireThat(claims.exp === quote.expiresAt && quote.expiresAt > now + 15, "Quote expires too soon");
  requireThat(stable(claims.request) === stable(normalized(request, claims.request?.idempotencyKey)), "Signed request differs from requested task");
  requireThat(quote.summary && typeof quote.summary === "object" && !Array.isArray(quote.summary) && quote.pricing && typeof quote.pricing === "object" && !Array.isArray(quote.pricing) && stable(quote.summary) === stable(claims.summary) && stable(quote.pricing) === stable(claims.pricing), "Preview differs from signed summary or pricing");
  requireThat(quote.summary.source?.chainId === request.chainId, "Signed preview source has wrong chain");
  requireThat(claims.paymentRequiredHash === hash(requiredHeader) && (!quote.paymentRequired || quote.paymentRequired === requiredHeader), "Payment requirement attestation mismatch");
  const required = JSON.parse(Buffer.from(requiredHeader, "base64").toString());
  requireThat(required.x402Version === 2 && required.accepts?.length === 1, "Unsupported x402 requirement");
  requireThat(required.extensions?.aomiTask?.quoteId === quote.quoteId && required.extensions?.aomiTask?.payloadHash === quote.payloadHash, "x402 quote binding mismatch");
  requireThat(required.resource?.url === `/v1/tasks/quotes/${quote.quoteId}/purchase` && required.resource.mimeType === "application/json", "Unexpected payment resource");
  const accepted = required.accepts[0];
  const fee = decimal(accepted.amount);
  requireThat(request.chainId === 5_042_002 && accepted.scheme === "exact" && accepted.network === `eip155:${request.chainId}`, "Only explicitly supported Arc testnet Gateway rail is allowed");
  requireThat(address(accepted.asset) === USDC && address(accepted.payTo) === address(options.recipient), "Unexpected asset or recipient");
  requireThat(address(request.payer ?? request.sender) === address(options.payer) && address(claims.payer) === address(options.payer) && Number(claims.chainId) === request.chainId, "Wrong payer or chain");
  requireThat(fee > 0n && fee <= options.maxFeeMicrousd && (typeof claims.amountMicrousd === "string" || Number.isSafeInteger(claims.amountMicrousd)) && BigInt(claims.amountMicrousd) === fee && decimal(quote.pricing?.fee_microusd) === fee, "Fee exceeds limit or differs from signed quote");
  requireThat(typeof accepted.extra?.aomiTaskNonce === "string" && /^0x[0-9a-f]{64}$/.test(accepted.extra.aomiTaskNonce) && accepted.extra.aomiTaskNonce !== `0x${"0".repeat(64)}`, "Missing or invalid quote-bound authorization nonce");
  requireThat(accepted.extra?.name === "GatewayWalletBatched" && accepted.extra?.version === "1" && address(accepted.extra?.verifyingContract) === GATEWAY, "Unexpected EIP712 domain");
  requireThat(Number.isSafeInteger(accepted.extra.minValiditySeconds) && accepted.extra.minValiditySeconds > 0 && accepted.extra.minValiditySeconds <= 691_140 && Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 && accepted.maxTimeoutSeconds <= 300, "Unsupported authorization lifetime");
  return { required, accepted };
}

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export class TaskClient {
  readonly options: TaskClientOptions;

  constructor(options: TaskClientOptions) {
    const url = new URL(options.endpoint);
    requireThat(
      url.pathname === "/v1/task/build" && !url.search && !url.username && !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))),
      "Use explicit HTTPS Task API endpoint (loopback HTTP allowed)",
    );
    requireThat(options.maxFeeMicrousd > 0n, "Set an explicit positive fee cap");
    this.options = options;
  }

  private now() {
    return this.options.now?.() ?? Math.floor(Date.now() / 1_000);
  }

  private async save(state: Record<string, any>) {
    const file = path.join(this.options.stateDirectory, "state.json");
    const temporary = `${file}.${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    const directory = await open(this.options.stateDirectory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async post(body: unknown, payment?: string) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (payment) headers["payment-signature"] = payment;
    const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(payment ? 30_000 : 100_000),
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > 4 * 1_024 * 1_024) {
          await reader.cancel();
          throw new Error("Response too large; keep pending authorization");
        }
        chunks.push(value);
      }
    }
    return { response, bytes: Buffer.concat(chunks) };
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.options.stateDirectory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.options.stateDirectory);
    requireThat(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, "State directory must be private (0700) and not a symlink");
    const lock = path.join(this.options.stateDirectory, "lock");
    await mkdir(lock, { mode: 0o700 });
    try {
      return await operation();
    } finally {
      await rmdir(lock);
    }
  }

  private policy(request: TaskRequest) {
    return {
      endpoint: this.options.endpoint,
      payer: address(this.options.payer),
      recipient: address(this.options.recipient),
      maxFee: this.options.maxFeeMicrousd.toString(),
      request: normalized(request),
    };
  }

  private async load(request: TaskRequest) {
    const policy = this.policy(request);
    let state: Record<string, any>;
    try {
      const file = path.join(this.options.stateDirectory, "state.json");
      const info = await lstat(file);
      requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, "Journal must be private regular file");
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = { policy, idempotencyKey: this.options.idempotencyKey?.() ?? randomUUID(), phase: "prepare" };
      await this.save(state);
    }
    requireThat(stable(state.policy) === stable(policy), "Existing purchase differs; retain journal and reconcile it before any new purchase");
    return state;
  }

  private async prepared(request: TaskRequest) {
    let state = await this.load(request);
    if (!state.quote && (!state.taskAuthorization || state.taskAuthorization.expiresAt <= this.now() + 30)) {
      const issuedAt = this.now();
      const authorization = taskAuthorizationData(request, state.idempotencyKey, issuedAt);
      requireThat(!state.requestHash || state.requestHash === authorization.requestHash.slice(2), "Refreshed Task authorization changed the request hash");
      const signature = await this.options.signTypedData(authorization.typedData);
      requireThat(/^0x(?:[0-9a-f]{2})+$/i.test(signature) && signature.length >= 132 && signature.length <= 32_770, "Invalid Task authorization signature");
      state.taskAuthorization = {
        issuedAt,
        expiresAt: issuedAt + 300,
        signature: signature.toLowerCase(),
      };
      state.requestHash = authorization.requestHash.slice(2);
      state.phase = "task_authorized";
      await this.save(state);
    }
    if (!state.quote) {
      const wireRequest = normalized(request, state.idempotencyKey);
      const { response, bytes } = await this.post({
        ...wireRequest,
        chainId: request.chainId,
        calls: request.calls ?? [],
        constraints: request.constraints ?? null,
        authorization: state.taskAuthorization,
      });
      requireThat(response.status === 402, "No payable quote; retain idempotency key");
      const header = response.headers.get("payment-required");
      requireThat(header, "Missing Payment-Required");
      const quote = JSON.parse(bytes.toString());
      requireThat(quote.requestHash === state.requestHash, "Quote request hash differs from the signed Task request");
      validateQuote(quote, header, request, this.options, this.now());
      state = { ...state, quote, requiredHeader: header, verifiedAt: this.now(), phase: "quoted" };
      await this.save(state);
    }
    validateQuote(state.quote, state.requiredHeader, request, this.options, state.paymentSignature ? state.verifiedAt : this.now());
    return state;
  }

  async prepare(request: TaskRequest): Promise<TaskQuotePreview> {
    return this.withLock(async () => {
      const state = await this.prepared(request);
      return {
        quoteId: state.quote.quoteId,
        requestHash: state.quote.requestHash,
        payloadHash: state.quote.payloadHash,
        summary: state.quote.summary,
        pricing: state.quote.pricing,
        expiresAt: state.quote.expiresAt,
      };
    });
  }

  async purchase(request: TaskRequest): Promise<TaskPurchaseResult> {
    return this.withLock(() => this.locked(request));
  }

  private async locked(request: TaskRequest): Promise<TaskPurchaseResult> {
    let state = await this.prepared(request);
    const { required, accepted } = validateQuote(
      state.quote,
      state.requiredHeader,
      request,
      this.options,
      state.paymentSignature ? state.verifiedAt : this.now(),
    );
    if (state.phase === "complete") {
      const bytes = Buffer.from(state.bytes, "base64");
      requireThat(hash(bytes) === state.quote.payloadHash, "Stored artifact hash mismatch");
      return { status: "complete", bytes, receipt: state.receipt };
    }
    if (!state.authorization) {
      const now = this.now();
      state.authorization = {
        from: address(this.options.payer),
        to: address(this.options.recipient),
        value: accepted.amount,
        validAfter: String(Math.max(0, now - 60)),
        validBefore: String(Math.min(now + 691_200, state.quote.expiresAt + accepted.extra.minValiditySeconds + 60)),
        nonce: accepted.extra.aomiTaskNonce,
      };
      state.phase = "signing";
      await this.save(state);
    }
    if (!state.paymentSignature && decimal(state.authorization.validBefore) < BigInt(this.now() + accepted.extra.minValiditySeconds)) {
      const now = this.now();
      state.authorization.validAfter = String(Math.max(0, now - 60));
      state.authorization.validBefore = String(Math.min(now + 691_200, state.quote.expiresAt + accepted.extra.minValiditySeconds + 60));
      await this.save(state);
    }
    const authorization = state.authorization;
    requireThat(address(authorization.from) === address(this.options.payer) && address(authorization.to) === address(this.options.recipient) && authorization.value === accepted.amount && authorization.nonce === accepted.extra.aomiTaskNonce && BigInt(authorization.validBefore) > BigInt(authorization.validAfter), "Stored authorization mismatch");
    if (!state.paymentSignature) {
      const now = this.now();
      requireThat(decimal(authorization.validAfter) <= BigInt(now) && decimal(authorization.validBefore) >= BigInt(now + accepted.extra.minValiditySeconds) && decimal(authorization.validBefore) <= BigInt(now + 691_200), "Authorization expired; do not substitute a new nonce");
      const signature = await this.options.signTypedData({
        domain: { name: "GatewayWalletBatched", version: "1", chainId: request.chainId, verifyingContract: GATEWAY },
        types: TYPES,
        primaryType: "TransferWithAuthorization",
        message: {
          ...authorization,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore),
        },
      });
      requireThat(/^0x[0-9a-f]+$/i.test(signature) && signature.length >= 132 && signature.length <= 32_770, "Invalid wallet signature");
      state.paymentSignature = Buffer.from(JSON.stringify({
        x402Version: 2,
        accepted,
        resource: required.resource,
        payload: { signature, authorization },
      })).toString("base64");
      state.phase = "pending";
      await this.save(state);
    }
    const wire = JSON.parse(Buffer.from(state.paymentSignature, "base64").toString());
    requireThat(wire.x402Version === 2 && stable(wire.accepted) === stable(accepted) && stable(wire.resource) === stable(required.resource) && stable(wire.payload?.authorization) === stable(authorization) && /^0x[0-9a-f]+$/i.test(wire.payload?.signature), "Stored signed payload differs from durable authorization");
    const { response, bytes } = await this.post(
      {
        quoteId: state.quote.quoteId,
        retrievalToken: state.quote.retrievalToken,
        authorization: state.taskAuthorization,
      },
      state.paymentSignature,
    );
    if (response.status !== 200) return { status: "pending" };
    requireThat(hash(bytes) === state.quote.payloadHash, "Paid response bytes do not match attestation; preserve pending payment");
    const receiptHeader = response.headers.get("payment-response");
    requireThat(receiptHeader, "Missing payment receipt; preserve pending payment");
    const receipt = JSON.parse(Buffer.from(receiptHeader, "base64").toString());
    requireThat(receipt.success === true && receipt.network === `eip155:${request.chainId}` && address(receipt.payer) === address(this.options.payer) && typeof receipt.transaction === "string" && receipt.transaction.length > 0, "Payment receipt mismatch");
    state.phase = "complete";
    state.bytes = bytes.toString("base64");
    state.receipt = receipt;
    await this.save(state);
    return { status: "complete", bytes, receipt };
  }
}

export type SmartAccountCall = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

export type SmartAccountCallPlan = {
  chainId: number;
  wallet: `0x${string}`;
  requestHash: string;
  authorizationIdentity: string;
  codeHash?: string;
  counterfactual: boolean;
  expiresAt: number;
  artifactHash: string;
  buildDigest: string;
  calls: SmartAccountCall[];
  summary: Record<string, unknown>;
};

export function parseSmartAccountArtifact(
  bytes: Buffer,
  request: TaskRequest,
  quote: TaskQuotePreview,
  now = Math.floor(Date.now() / 1_000),
): SmartAccountCallPlan {
  requireThat(request.executionKind === "smart_account_calls", "Request is not smart-account call mode");
  const artifact = object(JSON.parse(bytes.toString("utf8")), "Task artifact");
  const build = object(artifact.build, "Task build");
  const report = object(artifact.report, "Task report");
  const summary = object(artifact.summary, "Task summary");
  requireThat(stable(summary) === stable(quote.summary), "Paid artifact summary differs from the attested quote preview");
  requireThat(summary.requestHash === quote.requestHash, "Artifact is not bound to the signed Task request");
  requireThat(summary.senderBinding?.executionKind === "smart_account_calls" && summary.senderBinding?.simulationScope === "inner_calls_only", "Artifact does not state the smart-account simulation boundary");
  requireThat(typeof summary.authorizationIdentity === "string" && summary.authorizationIdentity.length > 4, "Artifact is missing wallet authorization identity");
  requireThat(build.version === 2 && build.status === "simulated" && build.expiresAt > now + 15, "Task build is not a live simulated Build");
  const buildDigest = sha256Digest(build.digest);
  requireThat(Array.isArray(artifact.walletCalls) && artifact.walletCalls.length > 0 && artifact.walletCalls.length <= 16, "Smart-account artifact must expose ordered wallet calls");
  const requestedCalls = request.calls;
  requireThat(Array.isArray(requestedCalls) && requestedCalls.length === artifact.walletCalls.length, "Artifact call count differs from the signed request");
  requireThat(Array.isArray(build.actions) && build.actions.length === artifact.walletCalls.length, "Wallet calls and simulated actions differ in length");
  requireThat(Array.isArray(report.steps) && report.steps.length === artifact.walletCalls.length, "Wallet calls and simulation differ in length");
  const calls = artifact.walletCalls.map((raw: unknown, index: number) => {
    const call = object(raw, `Wallet call ${index + 1}`);
    const action = object(build.actions[index], `Task action ${index + 1}`);
    const step = object(report.steps[index], `Simulation step ${index + 1}`);
    const to = address(call.to) as `0x${string}`;
    requireThat(typeof call.data === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(call.data), "Wallet calldata is invalid");
    const value = exactWei(call.value).toString();
    const expected = requestedCalls[index];
    requireThat(
      address(expected.to) === to
        && expected.data.toLowerCase() === call.data.toLowerCase()
        && exactWei(expected.value).toString() === value,
      "Wallet call differs from the signed Task request",
    );
    requireThat(
      address(action.from) === address(request.sender) && address(action.to) === to &&
      String(action.data).toLowerCase() === call.data.toLowerCase() && exactWei(action.value).toString() === value,
      "Wallet call differs from the frozen action",
    );
    requireThat(
      step.step === index + 1 && step.execution?.status === "succeeded" &&
      address(step.call?.to) === to && String(step.call?.data).toLowerCase() === call.data.toLowerCase() &&
      exactWei(step.call?.value).toString() === value,
      "Wallet call differs from successful simulation evidence",
    );
    return { to, data: call.data.toLowerCase() as `0x${string}`, value };
  });
  return {
    chainId: request.chainId,
    wallet: address(request.sender) as `0x${string}`,
    requestHash: quote.requestHash,
    authorizationIdentity: summary.authorizationIdentity,
    codeHash: summary.senderBinding.codeHash,
    counterfactual: summary.senderBinding.counterfactual === true,
    expiresAt: build.expiresAt,
    artifactHash: quote.payloadHash,
    buildDigest,
    calls,
    summary,
  };
}

export function taskClientWithCircle(
  options: Omit<TaskClientOptions, "signTypedData">,
  wallet: CircleArcWallet,
  approvePurchase: Parameters<CircleArcWallet["signTypedData"]>[1],
) {
  return new TaskClient({
    ...options,
    signTypedData: (typedData) => wallet.signTypedData(typedData, approvePurchase),
  });
}

export type ArcPaymentIntent = {
  intent: string;
  reference: string;
  sender: string;
  recipient: string;
  amountUsdc: string;
  maxGasUnits?: number;
};

export type ArcTransferPlan = {
  chainId: typeof ARC_TESTNET_CHAIN_ID;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  amountUsdc: string;
  amountWei: string;
  reference: string;
  artifactHash: string;
  buildDigest: string;
  expiresAt: number;
  simulation: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type ArcExecutionResult = {
  servicePurchaseReceipt: unknown;
  circle: CircleTransferResult;
  receipt: ArcReceipt;
  plan: ArcTransferPlan;
};

export type ArcExecutionKitOptions = Omit<TaskClientOptions, "payer" | "signTypedData"> & {
  wallet: CircleArcWallet;
  rpcUrl: string;
  rpcFetch?: typeof fetch;
};

function object(value: unknown, name: string): Record<string, any> {
  requireThat(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value as Record<string, any>;
}

function usdcWei(value: string): string {
  requireThat(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value), "USDC amount must have at most six decimals");
  const [whole, fraction = ""] = value.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  requireThat(wei > 0n, "USDC amount must be positive");
  return wei.toString();
}

function exactWei(value: unknown): bigint {
  requireThat(typeof value === "string" && (/^(0|[1-9][0-9]*)$/.test(value) || /^0x[0-9a-f]+$/i.test(value)), "Invalid transaction value");
  return BigInt(value);
}

function sha256Digest(value: unknown): string {
  requireThat(typeof value === "string", "Task build digest is invalid");
  const match = /^(?:sha256:)?([0-9a-f]{64})$/i.exec(value);
  requireThat(match, "Task build digest is invalid");
  return match[1].toLowerCase();
}

export function parseArcTransferArtifact(
  bytes: Buffer,
  request: TaskRequest,
  quote: TaskQuotePreview,
  amountUsdc: string,
  now = Math.floor(Date.now() / 1_000),
  reference = "task-artifact",
): ArcTransferPlan {
  let artifact: Record<string, any>;
  try {
    artifact = object(JSON.parse(bytes.toString("utf8")), "Task artifact");
  } catch (error) {
    throw new Error(`Task artifact is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const build = object(artifact.build, "Task build");
  const report = object(artifact.report, "Task report");
  const summary = object(artifact.summary, "Task summary");
  requireThat(stable(summary) === stable(quote.summary), "Paid artifact summary differs from the attested quote preview");
  requireThat(build.version === 2 && build.status === "simulated", "Task build is not a supported simulated Build");
  requireThat(Number.isSafeInteger(build.expiresAt) && build.expiresAt > now + 15, "Task build has expired or expires too soon");
  const buildDigest = sha256Digest(build.digest);
  requireThat(Array.isArray(build.actions) && build.actions.length === 1, "Execution Kit V1 requires exactly one action");
  const action = object(build.actions[0], "Task action");
  const sender = address(request.sender) as `0x${string}`;
  const targets = ((request.constraints as Record<string, unknown> | undefined)?.allowedTargets ?? []) as unknown[];
  requireThat(targets.length === 1, "Execution Kit V1 requires one explicit allowed target");
  const recipient = address(targets[0]) as `0x${string}`;
  const amountWei = usdcWei(amountUsdc);
  requireThat(
    action.chain_id === ARC_TESTNET_CHAIN_ID && address(action.from) === sender && address(action.to) === recipient &&
    exactWei(action.value ?? "0") === BigInt(amountWei) && action.data === "0x" && action.kind === "native_transfer",
    "Task action does not match the bounded native-USDC transfer",
  );
  requireThat(build.simulation?.status === "passed", "Build simulation did not pass");
  requireThat(Array.isArray(summary.approvals) && summary.approvals.length === 0, "V1 does not execute token approvals");
  requireThat(summary.actionCount === 1 && summary.source?.chainId === ARC_TESTNET_CHAIN_ID, "Task summary does not describe one Arc Testnet action");
  requireThat(summary.outgoingUsdcWei === amountWei, "Task summary outflow differs from the approved amount");
  requireThat(Array.isArray(summary.constraints) && summary.constraints.every((item: any) => item?.status === "passed"), "A Task constraint did not pass");
  requireThat(Array.isArray(report.contexts) && report.contexts.length === 1, "Task report requires one Arc simulation context");
  const context = object(report.contexts[0], "Simulation context");
  requireThat(context.chain_id === ARC_TESTNET_CHAIN_ID && address(context.sender) === sender && Array.isArray(context.balance_overrides) && context.balance_overrides.length === 0, "Simulation context does not match the reviewed sender and chain");
  requireThat(Array.isArray(report.steps) && report.steps.length === 1, "Task report requires one successful step");
  const step = object(report.steps[0], "Simulation step");
  const call = object(step.call, "Simulation call");
  requireThat(
    step.chain_id === ARC_TESTNET_CHAIN_ID && step.execution?.status === "succeeded" && address(call.to) === recipient &&
    exactWei(call.value) === BigInt(amountWei) && call.data === "0x",
    "Simulation evidence differs from the reviewed transfer",
  );
  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    sender,
    recipient,
    amountUsdc,
    amountWei,
    reference,
    artifactHash: quote.payloadHash,
    buildDigest,
    expiresAt: build.expiresAt,
    simulation: build.simulation,
    summary,
  };
}

export class ArcPurchasedArtifact {
  constructor(
    readonly plan: ArcTransferPlan,
    readonly servicePurchaseReceipt: unknown,
    private readonly wallet: CircleArcWallet,
    private readonly rpcUrl: string,
    private readonly stateDirectory: string,
    private readonly rpcFetch: typeof fetch = fetch,
  ) {}

  async execute(confirm: (review: CircleCommandReview) => boolean | Promise<boolean>): Promise<ArcExecutionResult> {
    const lock = path.join(this.stateDirectory, "execution-lock");
    await mkdir(lock, { mode: 0o700 });
    try {
      return await this.executeLocked(confirm);
    } finally {
      await rmdir(lock);
    }
  }

  private async saveExecution(state: Record<string, unknown>) {
    const file = path.join(this.stateDirectory, "execution.json");
    const temporary = `${file}.${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  }

  private async executeLocked(confirm: (review: CircleCommandReview) => boolean | Promise<boolean>): Promise<ArcExecutionResult> {
    const file = path.join(this.stateDirectory, "execution.json");
    let state: Record<string, any>;
    try {
      const info = await lstat(file);
      requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, "Execution journal must be a private regular file");
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = {
        version: 1,
        artifactHash: this.plan.artifactHash,
        plan: this.plan,
        servicePurchaseReceipt: this.servicePurchaseReceipt,
        idempotencyKey: `task-${this.plan.artifactHash.slice(0, 32)}`,
        phase: "prepared",
      };
      await this.saveExecution(state);
    }
    requireThat(state.artifactHash === this.plan.artifactHash && stable(state.plan) === stable(this.plan), "Execution journal belongs to a different Task artifact");
    if (state.phase === "complete") {
      requireThat(state.circle?.transactionHash === state.receipt?.transactionHash, "Stored Circle and Arc records do not correlate");
      return { servicePurchaseReceipt: state.servicePurchaseReceipt, circle: state.circle, receipt: state.receipt, plan: this.plan };
    }
    const transfer = {
      chainId: ARC_TESTNET_CHAIN_ID,
      recipient: this.plan.recipient,
      amountUsdc: this.plan.amountUsdc,
      invoiceId: this.plan.reference,
      idempotencyKey: state.idempotencyKey,
    } as const;
    let circle = state.circle as CircleTransferResult | undefined;
    if (!circle) {
      const review = this.wallet.reviewTransfer(transfer);
      if (!(await confirm(review))) throw new Error("Circle wallet transfer rejected by the reviewer");
      state.phase = "submission_pending";
      await this.saveExecution(state);
      circle = await this.wallet.transfer(transfer, () => true);
      state.circle = circle;
      state.phase = "circle_submitted";
      await this.saveExecution(state);
    }
    if (circle.transactionId && !circle.transactionHash) {
      circle = await this.wallet.waitForConfirmation(circle.transactionId);
      state.circle = circle;
      state.phase = "circle_confirmed";
      await this.saveExecution(state);
    }
    requireThat(circle.transactionHash, "Circle did not return a confirmed Arc transaction hash");
    const receipt = await verifyArcTransferReceipt(circle.transactionHash, this.rpcUrl, {
      from: this.plan.sender,
      to: this.plan.recipient,
      valueWei: this.plan.amountWei,
    }, this.rpcFetch);
    state.receipt = receipt;
    state.phase = "complete";
    await this.saveExecution(state);
    return { servicePurchaseReceipt: state.servicePurchaseReceipt, circle, receipt, plan: this.plan };
  }
}

export class ArcExecutionQuote {
  constructor(
    readonly preview: TaskQuotePreview,
    private readonly request: TaskRequest,
    private readonly amountUsdc: string,
    private readonly reference: string,
    private readonly client: TaskClient,
    private readonly wallet: CircleArcWallet,
    private readonly rpcUrl: string,
    private readonly setPurchaseApproval: (approval?: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>) => void,
    private readonly rpcFetch: typeof fetch = fetch,
  ) {}

  async purchase(confirm: (preview: TaskQuotePreview) => boolean | Promise<boolean>): Promise<ArcPurchasedArtifact | { status: "pending" }> {
    if (!(await confirm(this.preview))) throw new Error("Aomi service purchase rejected by the reviewer");
    this.setPurchaseApproval(() => true);
    try {
      const result = await this.client.purchase(this.request);
      if (result.status === "pending") return result;
      const plan = parseArcTransferArtifact(result.bytes, this.request, this.preview, this.amountUsdc, undefined, this.reference);
      return new ArcPurchasedArtifact(plan, result.receipt, this.wallet, this.rpcUrl, this.client.options.stateDirectory, this.rpcFetch);
    } finally {
      this.setPurchaseApproval(undefined);
    }
  }
}

export class ArcExecutionKit {
  private constructor(readonly options: ArcExecutionKitOptions) {}

  static arcTestnet(options: ArcExecutionKitOptions) {
    return new ArcExecutionKit(options);
  }

  async prepare(
    intent: ArcPaymentIntent,
    authorizeTask: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>,
  ): Promise<ArcExecutionQuote> {
    requireThat(address(intent.sender) === address(this.options.wallet.walletAddress), "Circle wallet must be the selected sender");
    requireThat(Boolean(intent.reference.trim()) && intent.reference.length <= 120, "A short payment reference is required");
    const recipient = address(intent.recipient);
    const amountWei = usdcWei(intent.amountUsdc);
    const request: TaskRequest = {
      intent: intent.intent,
      chainId: ARC_TESTNET_CHAIN_ID,
      sender: this.options.wallet.walletAddress,
      payer: this.options.wallet.walletAddress,
      constraints: {
        maxOutgoingUsdcWei: amountWei,
        maxGasUnits: intent.maxGasUnits ?? 100_000,
        allowedTargets: [recipient],
        minimumReceived: [],
      },
    };
    let purchaseApproval: ((review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>) | undefined;
    const client = new TaskClient({
      ...this.options,
      payer: this.options.wallet.walletAddress,
      signTypedData: (typedData) => {
        const primaryType = (typedData as { primaryType?: unknown } | null)?.primaryType;
        if (primaryType === "TaskAuthorization") return this.options.wallet.signTypedData(typedData, authorizeTask);
        requireThat(primaryType === "TransferWithAuthorization", "Unsupported typed-data request");
        requireThat(purchaseApproval, "Purchase approval was not established");
        return this.options.wallet.signTypedData(typedData, purchaseApproval);
      },
    });
    const preview = await client.prepare(request);
    return new ArcExecutionQuote(
      preview,
      request,
      intent.amountUsdc,
      intent.reference,
      client,
      this.options.wallet,
      this.options.rpcUrl,
      (approval) => { purchaseApproval = approval; },
      this.options.rpcFetch,
    );
  }
}
