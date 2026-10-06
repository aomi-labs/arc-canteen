/** Purchases immutable Task API bytes. It never signs or submits the resulting execution actions. */
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import type { JsonWebKey as NodeJsonWebKey } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import type { CircleArcWallet } from "@arc-canteen/circle-arc-wallet";

export type TaskRequest = {
  intent: string;
  chainId: number;
  sender: string;
  payer?: string;
  constraints?: Record<string, unknown> | null;
};

export type TaskClientOptions = {
  endpoint: string;
  token: () => string;
  subject: string;
  payer: string;
  recipient: string;
  maxFeeMicrousd: bigint;
  trustedJwks: { keys: Record<string, unknown>[] };
  stateDirectory: string;
  signTypedData: (data: unknown) => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
};

export type TaskPurchaseResult =
  | { status: "complete"; bytes: Buffer; receipt: unknown }
  | { status: "pending" };

const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY = "0x0077777d7eba4688bdef3e311b846f25870a19b9";
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

function normalized(request: TaskRequest) {
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
    intent: request.intent,
    chainId: request.chainId,
    sender: address(request.sender),
    payer: address(request.payer ?? request.sender),
    constraints,
  };
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
  const claims = verifyAttestation(quote.attestation, options.trustedJwks, options.subject, now) as Record<string, any>;
  requireThat(typeof quote.quoteId === "string" && /^[0-9a-f-]{36}$/i.test(quote.quoteId) && typeof quote.retrievalToken === "string" && quote.retrievalToken.length >= 32, "Invalid quote capability");
  requireThat(/^[0-9a-f]{64}$/.test(quote.payloadHash) && claims.quoteId === quote.quoteId && claims.payloadHash === quote.payloadHash && claims.requestHash === quote.requestHash && /^[0-9a-f]{64}$/.test(quote.requestHash), "Quote hash binding mismatch");
  requireThat(claims.exp === quote.expiresAt && quote.expiresAt > now + 15, "Quote expires too soon");
  requireThat(stable(normalized(claims.request)) === stable(normalized(request)), "Signed request differs from requested task");
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
  requireThat(address(request.payer ?? request.sender) === address(options.payer) && address(claims.payer) === address(options.payer) && claims.chainId === request.chainId, "Wrong payer or chain");
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
      authorization: `Bearer ${this.options.token()}`,
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

  async purchase(request: TaskRequest): Promise<TaskPurchaseResult> {
    await mkdir(this.options.stateDirectory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.options.stateDirectory);
    requireThat(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, "State directory must be private (0700) and not a symlink");
    const lock = path.join(this.options.stateDirectory, "lock");
    await mkdir(lock, { mode: 0o700 });
    try {
      return await this.locked(request);
    } finally {
      await rmdir(lock);
    }
  }

  private async locked(request: TaskRequest): Promise<TaskPurchaseResult> {
    const policy = {
      endpoint: this.options.endpoint,
      subject: this.options.subject,
      payer: address(this.options.payer),
      recipient: address(this.options.recipient),
      maxFee: this.options.maxFeeMicrousd.toString(),
      request: normalized(request),
    };
    let state: Record<string, any>;
    try {
      const file = path.join(this.options.stateDirectory, "state.json");
      const info = await lstat(file);
      requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, "Journal must be private regular file");
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = { policy, idempotencyKey: randomUUID(), phase: "prepare" };
      await this.save(state);
    }
    requireThat(stable(state.policy) === stable(policy), "Existing purchase differs; retain journal and reconcile it before any new purchase");
    if (!state.quote) {
      const { response, bytes } = await this.post({ ...request, idempotencyKey: state.idempotencyKey });
      requireThat(response.status === 402, "No payable quote; retain idempotency key");
      const header = response.headers.get("payment-required");
      requireThat(header, "Missing Payment-Required");
      const quote = JSON.parse(bytes.toString());
      validateQuote(quote, header, request, this.options, this.now());
      state = { ...state, quote, requiredHeader: header, verifiedAt: this.now(), phase: "quoted" };
      await this.save(state);
    }
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
      requireThat(/^0x[0-9a-f]{130}$/i.test(signature), "Invalid wallet signature");
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
    requireThat(wire.x402Version === 2 && stable(wire.accepted) === stable(accepted) && stable(wire.resource) === stable(required.resource) && stable(wire.payload?.authorization) === stable(authorization) && /^0x[0-9a-f]{130}$/i.test(wire.payload?.signature), "Stored signed payload differs from durable authorization");
    const { response, bytes } = await this.post(
      { quoteId: state.quote.quoteId, retrievalToken: state.quote.retrievalToken },
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
