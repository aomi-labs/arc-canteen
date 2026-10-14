/** Purchases immutable Task API bytes. It never signs or submits the resulting execution actions. */
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import type { JsonWebKey as NodeJsonWebKey } from "node:crypto";
import { lstat, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import { withStateLock } from "./lock.ts";
import { encodeFunctionData, hashTypedData, keccak256, parseAbiItem, parseTransaction, recoverTransactionAddress, stringToHex, type TransactionSerialized } from "viem";
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID,
  arcNetwork,
  CircleArcWallet,
  verifyArcGatewaySettlement,
  verifyArcChainId,
  verifyArcTransferReceipt,
  type ArcChainId,
  type ArcUnsignedEvmTransaction,
  type CircleGatewaySettlement,
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
  rpcUrl?: string;
  rpcFetch?: typeof fetch;
  gatewayFetch?: typeof fetch;
  signTypedData: (data: unknown) => Promise<string>;
  idempotencyKey?: () => string;
  fetch?: typeof fetch;
  now?: () => number;
};

export type TaskPurchaseResult =
  | { status: "complete"; bytes: Buffer; receipt: unknown; settlement?: CircleGatewaySettlement }
  | { status: "pending" };

export type TaskQuotePreview = {
  quoteId: string;
  requestHash: string;
  payloadHash: string;
  summary: Record<string, unknown>;
  pricing: Record<string, unknown>;
  expiresAt: number;
};

const TASK_RESOURCE = "https://chat.aomi.dev/v1/task";
const TASK_ENDPOINT = "/v1/task/build";
const arcExecutionKitCapability: unique symbol = Symbol("ArcExecutionKit capability");
const taskExecutionCheckpoint: unique symbol = Symbol("TaskClient execution checkpoint");
const initializeTaskExecutionLedger: unique symbol = Symbol("TaskClient execution ledger initialization");
const markTaskGatewayFundingReady: unique symbol = Symbol("TaskClient Gateway funding verification");
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

function immutableSnapshot<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableSnapshot)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableSnapshot(item)]));
    return Object.freeze(copy) as T;
  }
  return value;
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
  arcNetwork(request.chainId);
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

/** Fetches verification keys from the HTTPS origin the caller already trusts for Task quotes. */
export async function fetchTrustedTaskJwks(taskEndpoint: string, requestFetch: typeof fetch = fetch) {
  let endpoint: URL;
  try {
    endpoint = new URL(taskEndpoint);
  } catch {
    throw new Error("Task endpoint must be an absolute HTTPS URL");
  }
  requireThat(
    endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
    "Trusted Task JWKS requires a clean HTTPS endpoint",
  );

  const response = await requestFetch(new URL("/.well-known/jwks.json", endpoint.origin), {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "omit",
    redirect: "error",
  });
  requireThat(response.status === 200, `Trusted Task JWKS request failed with HTTP ${response.status}`);
  const document: unknown = await response.json();
  requireThat(
    typeof document === "object" && document !== null && !Array.isArray(document) &&
      Array.isArray((document as { keys?: unknown }).keys) && (document as { keys: unknown[] }).keys.length > 0,
    "Invalid Task JWKS document",
  );

  const keys = (document as { keys: unknown[] }).keys.map((value) => {
    requireThat(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid Task JWKS key");
    const key = value as Record<string, unknown>;
    requireThat(
      Object.keys(key).every((field) => ["kty", "crv", "use", "key_ops", "alg", "kid", "x"].includes(field)) &&
        key.kty === "OKP" && key.crv === "Ed25519" && key.use === "sig" && key.alg === "EdDSA" &&
        Array.isArray(key.key_ops) && key.key_ops.length === 1 && key.key_ops[0] === "verify" &&
        typeof key.kid === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(key.kid) &&
        typeof key.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(key.x) &&
        Buffer.from(key.x, "base64url").length === 32 && Buffer.from(key.x, "base64url").toString("base64url") === key.x,
      "Invalid or non-public Ed25519 Task JWKS key",
    );
    return key;
  });
  requireThat(new Set(keys.map((key) => key.kid)).size === keys.length, "Duplicate Task JWKS key id");
  return { keys };
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
  const network = arcNetwork(request.chainId);
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
  requireThat(required.resource?.url === options.endpoint && required.resource.mimeType === "application/json", "Unexpected payment resource");
  const accepted = required.accepts[0];
  const fee = decimal(accepted.amount);
  requireThat(accepted.scheme === "exact" && accepted.network === `eip155:${request.chainId}`, "Payment rail does not match the selected Arc chain");
  requireThat(address(accepted.asset) === network.usdc && address(accepted.payTo) === address(options.recipient), "Unexpected asset or recipient");
  requireThat(address(request.payer ?? request.sender) === address(options.payer) && address(claims.payer) === address(options.payer) && Number(claims.chainId) === request.chainId, "Wrong payer or chain");
  requireThat(fee > 0n && fee <= options.maxFeeMicrousd && (typeof claims.amountMicrousd === "string" || Number.isSafeInteger(claims.amountMicrousd)) && BigInt(claims.amountMicrousd) === fee && decimal(quote.pricing?.fee_microusd) === fee, "Fee exceeds limit or differs from signed quote");
  requireThat(typeof accepted.extra?.aomiTaskNonce === "string" && /^0x[0-9a-f]{64}$/.test(accepted.extra.aomiTaskNonce) && accepted.extra.aomiTaskNonce !== `0x${"0".repeat(64)}`, "Missing or invalid quote-bound authorization nonce");
  requireThat(accepted.extra?.name === "GatewayWalletBatched" && accepted.extra?.version === "1" && address(accepted.extra?.verifyingContract) === network.gatewayWallet, "Unexpected EIP712 domain");
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
  readonly #options: TaskClientOptions;

  get options(): TaskClientOptions {
    return this.#options;
  }

  constructor(options: TaskClientOptions) {
    const url = new URL(options.endpoint);
    requireThat(
      url.pathname === "/v1/task/build" && !url.search && !url.username && !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))),
      "Use explicit HTTPS Task API endpoint (loopback HTTP allowed)",
    );
    requireThat(options.maxFeeMicrousd > 0n, "Set an explicit positive fee cap");
    this.#options = immutableSnapshot(options);
    Object.freeze(this);
  }

  private now() {
    return this.options.now?.() ?? Math.floor(Date.now() / 1_000);
  }

  private async save(state: Record<string, any>) {
    await this.writePrivateJson("state.json", state);
  }

  private async writePrivateJson(name: string, state: Record<string, any>) {
    const file = path.join(this.options.stateDirectory, name);
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

  private async readPrivateJson(name: string) {
    const file = path.join(this.options.stateDirectory, name);
    const info = await lstat(file);
    requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, `Task ${name} must be a private regular journal`);
    return JSON.parse(await readFile(file, "utf8")) as Record<string, any>;
  }

  async [initializeTaskExecutionLedger](artifactHash: string, servicePurchaseReceipt: unknown) {
    return this.withLock(async () => {
      const state = await this.readPrivateJson("state.json");
      requireThat(
        state.phase === "complete" && state.quote?.payloadHash === artifactHash &&
          typeof state.bytes === "string" && hash(Buffer.from(state.bytes, "base64")) === artifactHash &&
          stable(state.receipt) === stable(servicePurchaseReceipt),
        "Execution ledger is not bound to the verified purchased artifact and receipt",
      );
      let ledger: Record<string, any> | undefined;
      try {
        ledger = await this.readPrivateJson("execution.json");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (ledger) {
        requireThat(
          ledger.version === 1 && ledger.artifactHash === artifactHash &&
            stable(ledger.servicePurchaseReceipt) === stable(servicePurchaseReceipt),
          "Existing execution ledger belongs to a different Task artifact or purchase",
        );
      } else {
        requireThat(state.executionLedgerInitialized !== true, "Execution ledger is missing after initialization; reconcile the original transaction before recovery");
        ledger = {
          version: 1,
          artifactHash,
          servicePurchaseReceipt: immutableSnapshot(servicePurchaseReceipt),
          executionEverStarted: false,
        };
        await this.writePrivateJson("execution.json", ledger);
      }
      if (state.executionLedgerInitialized !== true) {
        state.executionLedgerInitialized = true;
        await this.save(state);
      }
      return true;
    });
  }

  async [markTaskGatewayFundingReady](quoteId: string, feeMicrousd: string, fundingJournalHash: string) {
    return this.withLock(async () => {
      requireThat(/^[0-9a-f]{64}$/.test(fundingJournalHash), "Gateway funding journal hash is malformed");
      const state = await this.readPrivateJson("state.json");
      requireThat(
        ["quoted", "signing", "pending", "settlement_pending", "complete"].includes(state.phase) &&
          state.quote?.quoteId === quoteId && state.quote?.payloadHash &&
          state.quote?.pricing?.fee_microusd === feeMicrousd &&
          address(state.policy?.payer) === address(this.options.payer),
        "Verified Gateway funding does not match the active Task quote and payer",
      );
      if (state.gatewayFunding) {
        requireThat(
          state.gatewayFunding.quoteId === quoteId && state.gatewayFunding.feeMicrousd === feeMicrousd &&
            state.gatewayFunding.journalHash === fundingJournalHash,
          "Existing Task purchase is bound to a different Gateway funding journal",
        );
      } else {
        requireThat(state.phase === "quoted", "Gateway funding cannot be attached after a Mainnet payment attempt has started");
        state.gatewayFunding = { quoteId, feeMicrousd, journalHash: fundingJournalHash };
        await this.save(state);
      }
      return true;
    });
  }

  async [taskExecutionCheckpoint](artifactHash: string, checkpoint?: Record<string, unknown>) {
    return this.withLock(async () => {
      const purchase = await this.readPrivateJson("state.json");
      requireThat(
        purchase.phase === "complete" && purchase.quote?.payloadHash === artifactHash &&
          typeof purchase.bytes === "string" && hash(Buffer.from(purchase.bytes, "base64")) === artifactHash &&
          purchase.executionLedgerInitialized === true,
        "Task execution checkpoint is not bound to the verified purchased artifact",
      );
      let ledger: Record<string, any>;
      try {
        ledger = await this.readPrivateJson("execution.json");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error("Execution ledger is missing after initialization; reconcile the original transaction before recovery");
        }
        throw error;
      }
      requireThat(
        ledger.version === 1 && ledger.artifactHash === artifactHash &&
          stable(ledger.servicePurchaseReceipt) === stable(purchase.receipt),
        "Task execution ledger differs from the verified purchase",
      );
      const previous = ledger.executionJournal as Record<string, any> | undefined;
      const started = ledger.executionEverStarted === true;
      if (checkpoint) {
        requireThat(checkpoint.artifactHash === artifactHash, "Execution checkpoint belongs to a different Task artifact");
        if (previous) {
          requireThat(checkpoint.idempotencyKey === previous.idempotencyKey, "Execution checkpoint cannot change its original idempotency key");
          const phaseOrder = ["prepared", "submission_pending", "circle_submitted", "circle_confirmed", "complete"];
          const nextPhase = phaseOrder.indexOf(String(checkpoint.phase));
          const previousPhase = phaseOrder.indexOf(String(previous.phase));
          requireThat(nextPhase >= 0 && previousPhase >= 0 && nextPhase >= previousPhase, "Execution checkpoint cannot move to an unknown or earlier phase");
          const oldRaw = previous.circle?.raw?.rawTransaction;
          const nextRaw = (checkpoint as any).circle?.raw?.rawTransaction;
          if (oldRaw) requireThat(nextRaw === oldRaw, "Execution checkpoint cannot replace the original signed transaction");
          const oldNonce = previous.circle?.raw?.nonce;
          const nextNonce = (checkpoint as any).circle?.raw?.nonce;
          if (oldNonce !== undefined) requireThat(nextNonce === oldNonce, "Execution checkpoint cannot change the original transaction nonce");
        } else {
          requireThat(!started, "Execution checkpoint was removed after execution started; reconcile the original transaction before recovery");
        }
        ledger.executionEverStarted = true;
        ledger.executionJournal = immutableSnapshot(checkpoint);
        await this.writePrivateJson("execution.json", ledger);
        return { started: true, state: ledger.executionJournal as Record<string, any> };
      }
      requireThat(!started || previous, "Execution journal is missing after execution started; reconcile the original transaction before recovery");
      return { started, state: previous };
    });
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
    return withStateLock(this.options.stateDirectory, "lock", operation);
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
    let fundingJournal: Record<string, any> | undefined;
    try {
      fundingJournal = await this.readPrivateJson("gateway-funding.json");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (state.gatewayFunding) {
      requireThat(fundingJournal, "Gateway funding journal is missing after approval; preserve the Task nonce and reconcile before recovery");
    }
    if (fundingJournal) {
      const review = fundingJournal.review as ArcMainnetTaskReview | undefined;
      requireThat(
        fundingJournal.version === 1 && Boolean(review?.taskQuote) && fundingJournal.approvalHash === hash(stable(review)) &&
          review?.chainId === ARC_MAINNET_CHAIN_ID && state.quote?.quoteId === review.taskQuote.quoteId &&
          state.quote?.payloadHash === review.taskQuote.payloadHash && state.quote?.requestHash === review.taskQuote.requestHash &&
          state.quote?.pricing?.fee_microusd === review.feeMicrousd &&
          ["quoted", "signing", "pending", "settlement_pending", "complete"].includes(state.phase),
        "Task purchase journal was rolled back or changed after Mainnet Gateway funding approval",
      );
      if (state.gatewayFunding) {
        requireThat(
          state.gatewayFunding.quoteId === review.taskQuote.quoteId &&
            state.gatewayFunding.feeMicrousd === review.feeMicrousd &&
            state.gatewayFunding.journalHash === fundingJournal.approvalHash,
          "Task purchase does not match its Gateway funding approval",
        );
      }
    }
    let executionLedger: Record<string, any> | undefined;
    try {
      executionLedger = await this.readPrivateJson("execution.json");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (state.executionLedgerInitialized === true) {
      requireThat(executionLedger, "Execution ledger is missing after initialization; reconcile the original transaction before recovery");
    }
    if (executionLedger) {
      requireThat(
        state.phase === "complete" && state.quote?.payloadHash === executionLedger.artifactHash &&
          typeof state.bytes === "string" && hash(Buffer.from(state.bytes, "base64")) === executionLedger.artifactHash &&
          stable(state.receipt) === stable(executionLedger.servicePurchaseReceipt),
        "Task purchase journal was rolled back after execution was initialized; reconcile the original artifact before recovery",
      );
    }
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
    if (request.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(this.options.rpcUrl, "Arc Mainnet purchase requires an independent Circle settlement RPC verifier");
      await verifyArcChainId(this.options.rpcUrl, ARC_MAINNET_CHAIN_ID, this.options.rpcFetch);
      requireThat(
        state.gatewayFunding?.quoteId === state.quote.quoteId &&
          state.gatewayFunding.feeMicrousd === accepted.amount && /^[0-9a-f]{64}$/.test(state.gatewayFunding.journalHash),
        "Arc Mainnet purchase requires approved, verified Gateway funding through the Execution Kit",
      );
    }
    if (state.phase === "complete") {
      const bytes = Buffer.from(state.bytes, "base64");
      requireThat(hash(bytes) === state.quote.payloadHash, "Stored artifact hash mismatch");
      if (request.chainId === ARC_MAINNET_CHAIN_ID) return this.confirmMainnetSettlement(request, state, accepted);
      return { status: "complete", bytes, receipt: state.receipt, settlement: state.settlement };
    }
    if (state.phase === "settlement_pending") {
      return this.confirmMainnetSettlement(request, state, accepted);
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
        domain: { name: "GatewayWalletBatched", version: "1", chainId: request.chainId, verifyingContract: arcNetwork(request.chainId).gatewayWallet },
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
    if (request.chainId === ARC_MAINNET_CHAIN_ID) {
      state.phase = "settlement_pending";
      state.bytes = bytes.toString("base64");
      state.receipt = receipt;
      await this.save(state);
      return this.confirmMainnetSettlement(request, state, accepted);
    }
    state.phase = "complete";
    state.bytes = bytes.toString("base64");
    state.receipt = receipt;
    await this.save(state);
    return { status: "complete", bytes, receipt };
  }

  private async confirmMainnetSettlement(
    request: TaskRequest,
    state: Record<string, any>,
    accepted: { amount: string; extra: { aomiTaskNonce: string } },
  ): Promise<TaskPurchaseResult> {
    requireThat(request.chainId === ARC_MAINNET_CHAIN_ID && this.options.rpcUrl, "Mainnet settlement recovery requires the original Arc RPC");
    const settlement = await verifyArcGatewaySettlement({
      chainId: ARC_MAINNET_CHAIN_ID,
      rpcUrl: this.options.rpcUrl,
      nonce: accepted.extra.aomiTaskNonce,
      transferId: state.receipt.transaction,
      payer: this.options.payer,
      merchant: this.options.recipient,
      amountMicrousd: accepted.amount,
    }, { gatewayFetch: this.options.gatewayFetch, rpcFetch: this.options.rpcFetch });
    state.settlement = settlement;
    if (settlement.status !== "confirmed") {
      state.phase = "settlement_pending";
      await this.save(state);
      return { status: "pending" };
    }
    const bytes = Buffer.from(state.bytes, "base64");
    requireThat(hash(bytes) === state.quote.payloadHash, "Pending Mainnet artifact hash changed; preserve original journal");
    state.phase = "complete";
    await this.save(state);
    return { status: "complete", bytes, receipt: state.receipt, settlement };
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
      step.step === index + 1 && executionSucceeded(step.execution?.status) &&
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
  chainId: ArcChainId;
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

export type ArcExecutionGasBudget = {
  maxAggregateGasWei: bigint;
  alreadySpentGasWei: bigint;
  maxGasPriceWei: bigint;
};

export type ArcMainnetTransactionPreview = {
  kind: "approve" | "deposit" | "business_transfer";
  chainId: typeof ARC_MAINNET_CHAIN_ID;
  nonce: string;
  to: `0x${string}`;
  valueWei: string;
  data: `0x${string}`;
  gasLimitWei: string;
  gasPriceWei: string;
  maxGasCostWei: string;
};

export type ArcMainnetTaskReview = {
  kind: "arc_mainnet_task_purchase";
  taskQuote: TaskQuotePreview;
  chainId: typeof ARC_MAINNET_CHAIN_ID;
  payer: `0x${string}`;
  merchant: `0x${string}`;
  feeMicrousd: string;
  paymentNonce: string;
  initialGatewayBalanceMicrousd: string;
  initialAllowanceMicrousd: string;
  additionalDepositMicrousd: string;
  additionalAllowanceMicrousd: string;
  balances: {
    payerNativeWei: string;
    payerUsdcMicrousd: string;
    recipientNativeWei: string;
    recipientUsdcMicrousd: string;
  };
  sourceBlock: { number: string; hash: string };
  transactions: ArcMainnetTransactionPreview[];
  plannedWorstCaseGasWei: string;
  startingGasSpentWei: string;
  maxAggregateGasWei: string;
  maxGasPriceWei: string;
};

export type ArcExecutionApproval = TaskQuotePreview | ArcMainnetTaskReview;

type ArcMainnetFundingJournal = {
  version: 1;
  approvalHash: string;
  review: ArcMainnetTaskReview;
  approvedAt: number;
  status: "approved" | "funding" | "funded" | "purchased";
  spentGasWei: string;
  transactions: Record<string, any>;
  artifactHash?: string;
  paymentReceipt?: unknown;
};

function mainnetGasBudgetPolicy(budget?: ArcExecutionGasBudget) {
  requireThat(budget && budget.maxAggregateGasWei > 0n && budget.maxAggregateGasWei <= 100_000_000_000_000_000n, "Set an Arc Mainnet aggregate gas cap no greater than 0.1 USDC");
  requireThat(budget.alreadySpentGasWei >= 0n && budget.alreadySpentGasWei < budget.maxAggregateGasWei, "Arc Mainnet gas already spent exhausts the approved budget");
  requireThat(budget.maxGasPriceWei > 0n && budget.maxGasPriceWei <= 100_000_000_000n, "Arc Mainnet gas-price cap must be between zero and 100 gwei");
  return {
    maxAggregateGasWei: budget.maxAggregateGasWei.toString(),
    alreadySpentGasWei: budget.alreadySpentGasWei.toString(),
    maxGasPriceWei: budget.maxGasPriceWei.toString(),
  };
}

export type ArcExecutionKitOptions = Omit<TaskClientOptions, "payer" | "signTypedData"> & {
  wallet: CircleArcWallet;
  rpcUrl: string;
  rpcFetch?: typeof fetch;
  gasBudget?: ArcExecutionGasBudget;
};

function object(value: unknown, name: string): Record<string, any> {
  requireThat(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value as Record<string, any>;
}

async function arcRpc(rpcUrl: string, fetchImpl: typeof fetch, method: string, params: unknown[]) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }, (_, value) => typeof value === "bigint" ? `0x${value.toString(16)}` : value),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (body.error || body.result === undefined) throw new Error(`Arc RPC ${method} failed`);
  return body.result as any;
}

async function readPrivateJson(directory: string, name: string) {
  const file = path.join(directory, name);
  const info = await lstat(file);
  requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, `${name} must be a private regular journal`);
  return JSON.parse(await readFile(file, "utf8")) as Record<string, any>;
}

async function writePrivateJson(directory: string, name: string, value: Record<string, unknown>) {
  const file = path.join(directory, name);
  const temporary = `${file}.${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
  const directoryHandle = await open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

function parseMicrousd(value: unknown): bigint {
  requireThat(typeof value === "string" && /^\d+(?:\.\d{1,6})?$/.test(value), "Circle Gateway balance is malformed");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

async function arcGatewayBalance(
  payer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ microusd: bigint; pendingBatch: string | null }> {
  const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
  const response = await fetchImpl(`${network.gatewayApi}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ domain: network.gatewayDomain, depositor: address(payer) }] }),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  requireThat(response.ok, `Circle Gateway balance query returned HTTP ${response.status}`);
  const body = await response.json() as { token?: unknown; balances?: unknown };
  requireThat(body.token === "USDC" && Array.isArray(body.balances), "Circle Gateway balance response is malformed");
  const rows = body.balances.filter((value: any) => value && Number(value.domain) === network.gatewayDomain && address(value.depositor) === address(payer));
  requireThat(rows.length === 1, "Circle Gateway did not return one balance for the selected Mainnet payer");
  const row = rows[0] as Record<string, unknown>;
  return {
    microusd: parseMicrousd(row.balance),
    pendingBatch: row.pendingBatch == null ? null : String(row.pendingBatch),
  };
}

function callData(signature: string, args: readonly unknown[]) {
  const abi = [parseAbiItem(signature)];
  const functionName = signature.slice("function ".length).split("(")[0];
  return encodeFunctionData({ abi, functionName, args: [...args] } as any);
}

function executionSucceeded(value: unknown): boolean {
  return value === "succeeded" || (Boolean(value) && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === "succeeded");
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

async function waitForArcTransferReceipt(
  transactionHash: string,
  rpcUrl: string,
  chainId: ArcChainId,
  expected: { from: string; to: string; valueWei: string },
  fetchImpl: typeof fetch,
) {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      return await verifyArcTransferReceipt(transactionHash, rpcUrl, chainId, expected, fetchImpl);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Arc receipt is not confirmed yet") throw error;
      if (Date.now() >= deadline) {
        throw new Error("Arc transaction is still pending; resume with its existing execution journal and hash");
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
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
  const network = arcNetwork(request.chainId);
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
    action.chain_id === request.chainId && address(action.from) === sender && address(action.to) === recipient &&
    exactWei(action.value ?? "0") === BigInt(amountWei) && action.data === "0x" && action.kind === "native_transfer",
    "Task action does not match the bounded native-USDC transfer",
  );
  requireThat(build.simulation?.status === "passed", "Build simulation did not pass");
  requireThat(Array.isArray(summary.approvals) && summary.approvals.length === 0, "V1 does not execute token approvals");
  requireThat(summary.actionCount === 1 && summary.source?.chainId === request.chainId, `Task summary does not describe one ${network.displayName} action`);
  requireThat(summary.outgoingUsdcWei === amountWei, "Task summary outflow differs from the approved amount");
  requireThat(Array.isArray(summary.constraints) && summary.constraints.every((item: any) => item?.status === "passed"), "A Task constraint did not pass");
  requireThat(Array.isArray(report.contexts) && report.contexts.length === 1, "Task report requires one Arc simulation context");
  const context = object(report.contexts[0], "Simulation context");
  const hasLegacyOverrides = Object.prototype.hasOwnProperty.call(context, "balance_overrides");
  const hasCurrentOverrides = Object.prototype.hasOwnProperty.call(context, "overrides");
  const overrides = hasLegacyOverrides ? context.balance_overrides : context.overrides;
  requireThat(context.chain_id === request.chainId && address(context.sender) === sender && hasLegacyOverrides !== hasCurrentOverrides && Array.isArray(overrides) && overrides.length === 0, "Simulation context does not match the reviewed sender and chain");
  requireThat(Array.isArray(report.steps) && report.steps.length === 1, "Task report requires one successful step");
  const step = object(report.steps[0], "Simulation step");
  const call = object(step.call, "Simulation call");
  const hasLegacyExecution = Object.prototype.hasOwnProperty.call(step, "execution");
  const hasCurrentResult = Object.prototype.hasOwnProperty.call(step, "result");
  const execution = hasLegacyExecution ? step.execution : step.result;
  requireThat(
    step.chain_id === request.chainId && hasLegacyExecution !== hasCurrentResult && executionSucceeded(execution?.status) && address(call.to) === recipient &&
    exactWei(call.value) === BigInt(amountWei) && call.data === "0x",
    "Simulation evidence differs from the reviewed transfer",
  );
  return {
    chainId: network.chainId,
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

class ArcPurchasedArtifact {
  readonly #plan: ArcTransferPlan;
  readonly #servicePurchaseReceipt: unknown;
  readonly #wallet: CircleArcWallet;
  readonly #rpcUrl: string;
  readonly #stateDirectory: string;
  readonly #rpcFetch: typeof fetch;
  readonly #gasBudget?: ArcExecutionGasBudget;
  readonly #mainnetApproved: boolean;
  readonly #mainnetTransaction?: ArcMainnetTransactionPreview;
  readonly #persistCheckpoint: (checkpoint?: Record<string, unknown>) => Promise<{ started: boolean; state?: Record<string, any> }>;

  get plan(): ArcTransferPlan {
    return this.#plan;
  }

  get servicePurchaseReceipt(): unknown {
    return this.#servicePurchaseReceipt;
  }

  constructor(
    capability: typeof arcExecutionKitCapability,
    plan: ArcTransferPlan,
    servicePurchaseReceipt: unknown,
    wallet: CircleArcWallet,
    rpcUrl: string,
    stateDirectory: string,
    persistCheckpoint: (checkpoint?: Record<string, unknown>) => Promise<{ started: boolean; state?: Record<string, any> }>,
    rpcFetch: typeof fetch = fetch,
    gasBudget?: ArcExecutionGasBudget,
    mainnetApproved = false,
    mainnetTransaction?: ArcMainnetTransactionPreview,
  ) {
    requireThat(capability === arcExecutionKitCapability, "Executable artifacts can only be created from ArcExecutionKit");
    arcNetwork(plan.chainId);
    requireThat(address(plan.sender) === address(wallet.walletAddress), "Purchased artifact sender differs from the selected wallet");
    requireThat(BigInt(plan.amountWei) === BigInt(usdcWei(plan.amountUsdc)), "Purchased artifact USDC amount differs from its exact transaction value");
    requireThat(plan.reference.trim().length > 0, "Purchased artifact requires a payment reference");
    this.#plan = immutableSnapshot(plan);
    this.#servicePurchaseReceipt = immutableSnapshot(servicePurchaseReceipt);
    this.#wallet = wallet;
    this.#rpcUrl = rpcUrl;
    this.#stateDirectory = stateDirectory;
    this.#rpcFetch = rpcFetch;
    this.#gasBudget = gasBudget && Object.freeze({ ...gasBudget });
    this.#mainnetApproved = mainnetApproved;
    this.#mainnetTransaction = mainnetTransaction && immutableSnapshot(mainnetTransaction);
    if (plan.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(
        mainnetApproved && mainnetTransaction?.kind === "business_transfer" &&
          mainnetTransaction.chainId === ARC_MAINNET_CHAIN_ID && mainnetTransaction.to === plan.recipient &&
          mainnetTransaction.valueWei === plan.amountWei && mainnetTransaction.data === "0x",
        "Arc Mainnet artifact requires the exact transaction from the approved pre-purchase preview",
      );
    }
    this.#persistCheckpoint = persistCheckpoint;
    Object.freeze(this);
  }

  async execute(confirm?: (review: CircleCommandReview) => boolean | Promise<boolean>): Promise<ArcExecutionResult> {
    return withStateLock(this.#stateDirectory, "execution-lock", () => this.executeLocked(confirm));
  }

  private async saveExecution(state: Record<string, unknown>) {
    await this.#persistCheckpoint(state);
  }

  private async executeLocked(confirm?: (review: CircleCommandReview) => boolean | Promise<boolean>): Promise<ArcExecutionResult> {
    const persisted = await this.#persistCheckpoint();
    let state = persisted.state as Record<string, any> | undefined;
    const gasBudgetPolicy = this.#plan.chainId === ARC_MAINNET_CHAIN_ID ? mainnetGasBudgetPolicy(this.#gasBudget) : undefined;
    if (!state) {
      state = {
        version: 2,
        artifactHash: this.#plan.artifactHash,
        plan: this.#plan,
        servicePurchaseReceipt: this.#servicePurchaseReceipt,
        idempotencyKey: `task-${this.#plan.artifactHash.slice(0, 32)}`,
        ...(gasBudgetPolicy ? { gasBudget: gasBudgetPolicy } : {}),
        ...(this.#mainnetTransaction ? { approvedTransaction: this.#mainnetTransaction } : {}),
        phase: "prepared",
      };
      await this.saveExecution(state);
    }
    requireThat(state.artifactHash === this.#plan.artifactHash && stable(state.plan) === stable(this.#plan), "Execution journal belongs to a different Task artifact");
    requireThat(state.idempotencyKey === `task-${this.#plan.artifactHash.slice(0, 32)}`, "Execution journal changed its original idempotency key");
    requireThat(stable(state.servicePurchaseReceipt) === stable(this.#servicePurchaseReceipt), "Execution journal service receipt differs from the verified purchase");
    if (this.#mainnetTransaction) requireThat(stable(state.approvedTransaction) === stable(this.#mainnetTransaction), "Execution journal business transaction differs from the approved pre-purchase preview");
    if (gasBudgetPolicy) requireThat(state.version === 2 && stable(state.gasBudget) === stable(gasBudgetPolicy), "Execution journal gas budget differs from the approved policy; retain the original journal and reconcile it first");
    if (state.phase === "complete") {
      requireThat(state.circle?.transactionHash === state.receipt?.transactionHash, "Stored Circle and Arc records do not correlate");
      const verifiedReceipt = await verifyArcTransferReceipt(state.circle.transactionHash, this.#rpcUrl, this.#plan.chainId, {
        from: this.#plan.sender,
        to: this.#plan.recipient,
        valueWei: this.#plan.amountWei,
      }, this.#rpcFetch);
      if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
        const budget = this.#gasBudget;
        requireThat(budget, "Arc Mainnet execution requires its original gas budget");
        const transactionReceipt = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [state.circle.transactionHash]);
        const minedTransaction = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [state.circle.transactionHash]);
        const rawTransaction = state.circle.raw?.rawTransaction;
        requireThat(typeof rawTransaction === "string", "Stored Mainnet signed transaction is missing");
        const serialized = rawTransaction as `0x${string}`;
        requireThat(keccak256(serialized).toLowerCase() === state.circle.transactionHash.toLowerCase(), "Stored Mainnet transaction hash differs from its original signed bytes");
        const parsed = parseTransaction(serialized) as Record<string, any>;
        const signer = await recoverTransactionAddress({ serializedTransaction: serialized as TransactionSerialized<"legacy"> });
        const gasUsed = BigInt(transactionReceipt.gasUsed);
        const gasPrice = BigInt(transactionReceipt.effectiveGasPrice ?? minedTransaction.gasPrice);
        const gasCostWei = gasUsed * gasPrice;
        const rawGasCostWei = state.circle.raw?.receipt?.gasCostWei;
        requireThat(
          signer.toLowerCase() === this.#plan.sender.toLowerCase() && parsed.type === "legacy" &&
            BigInt(parsed.chainId) === BigInt(ARC_MAINNET_CHAIN_ID) && BigInt(parsed.nonce) === BigInt(state.circle.raw.nonce) &&
            BigInt(parsed.gas) === 21_000n && BigInt(parsed.gasPrice) <= budget.maxGasPriceWei &&
            parsed.to?.toLowerCase() === this.#plan.recipient.toLowerCase() && BigInt(parsed.value) === BigInt(this.#plan.amountWei) &&
            String(parsed.data ?? "0x").toLowerCase() === "0x" && transactionReceipt.status === "0x1" &&
            gasUsed > 0n && gasUsed <= BigInt(parsed.gas) && gasPrice <= budget.maxGasPriceWei &&
            this.#mainnetTransaction && BigInt(parsed.nonce) === BigInt(this.#mainnetTransaction.nonce) &&
            BigInt(parsed.gas) === BigInt(this.#mainnetTransaction.gasLimitWei) &&
            BigInt(parsed.gasPrice) === BigInt(this.#mainnetTransaction.gasPriceWei) &&
            rawGasCostWei === gasCostWei.toString(),
          "Stored Mainnet transaction, signer, or gas record differs from the confirmed reviewed transfer",
        );
        requireThat(budget.alreadySpentGasWei + gasCostWei <= budget.maxAggregateGasWei, "Arc Mainnet aggregate gas exceeded its approved hard limit");
      }
      state.receipt = verifiedReceipt;
      return { servicePurchaseReceipt: state.servicePurchaseReceipt, circle: state.circle, receipt: state.receipt, plan: this.#plan };
    }
    const transfer = {
      chainId: this.#plan.chainId,
      recipient: this.#plan.recipient,
      amountUsdc: this.#plan.amountUsdc,
      invoiceId: this.#plan.reference,
      idempotencyKey: state.idempotencyKey,
    } as const;
    let circle = state.circle as CircleTransferResult | undefined;
    if (!circle) {
      if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
        circle = await this.sendBoundedMainnetTransfer(transfer, state, async (review) => this.#mainnetApproved || Boolean(await confirm?.(review)));
      } else {
        const review = this.#wallet.reviewTransfer(transfer);
        if (!(await confirm?.(review))) throw new Error("Circle wallet transfer rejected by the reviewer");
        state.phase = "submission_pending";
        await this.saveExecution(state);
        circle = await this.#wallet.transfer(transfer, () => true);
        state.circle = circle;
        state.phase = "circle_submitted";
        await this.saveExecution(state);
      }
    }
    if (circle.transactionId && !circle.transactionHash) {
      circle = await this.#wallet.waitForConfirmation(circle.transactionId, this.#plan.chainId);
      state.circle = circle;
      state.phase = "circle_confirmed";
      await this.saveExecution(state);
    }
    requireThat(circle.transactionHash, "Circle did not return a confirmed Arc transaction hash");
    const receipt = await waitForArcTransferReceipt(circle.transactionHash, this.#rpcUrl, this.#plan.chainId, {
      from: this.#plan.sender,
      to: this.#plan.recipient,
      valueWei: this.#plan.amountWei,
    }, this.#rpcFetch);
    if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
      const budget = this.#gasBudget;
      requireThat(budget, "Arc Mainnet execution requires its original gas budget");
      const transactionReceipt = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [circle.transactionHash]);
      const minedTransaction = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [circle.transactionHash]);
      const gasUsed = BigInt(transactionReceipt.gasUsed);
      const gasPrice = BigInt(transactionReceipt.effectiveGasPrice ?? minedTransaction.gasPrice);
      const gasCostWei = gasUsed * gasPrice;
      requireThat(transactionReceipt.status === "0x1" && gasUsed <= 21_000n && gasPrice <= budget.maxGasPriceWei, "Arc Mainnet receipt exceeded the signed transaction gas envelope");
      requireThat(budget.alreadySpentGasWei + gasCostWei <= budget.maxAggregateGasWei, "Arc Mainnet aggregate gas exceeded its approved hard limit");
      circle = {
        ...circle,
        state: "confirmed",
        raw: {
          ...(circle.raw as Record<string, unknown>),
          receipt: { transactionHash: circle.transactionHash, gasUsed: gasUsed.toString(), gasPriceWei: gasPrice.toString(), gasCostWei: gasCostWei.toString() },
        },
      };
      state.circle = circle;
      state.phase = "circle_confirmed";
      await this.saveExecution(state);
    }
    state.receipt = receipt;
    state.phase = "complete";
    await this.saveExecution(state);
    return { servicePurchaseReceipt: state.servicePurchaseReceipt, circle, receipt, plan: this.#plan };
  }

  private async sendBoundedMainnetTransfer(
    transfer: { chainId: ArcChainId; recipient: `0x${string}`; amountUsdc: string; invoiceId: string; idempotencyKey: string },
    state: Record<string, any>,
    confirm: (review: CircleCommandReview) => boolean | Promise<boolean>,
  ): Promise<CircleTransferResult> {
    const budget = this.#gasBudget;
    const approved = this.#mainnetTransaction;
    requireThat(budget && approved && this.#mainnetApproved && this.#wallet.transactionSigner, "Arc Mainnet requires the exact pre-approved transaction and aggregate gas budget");
    mainnetGasBudgetPolicy(budget);
    await verifyArcChainId(this.#rpcUrl, ARC_MAINNET_CHAIN_ID, this.#rpcFetch);
    const [latestNonce, pendingNonce, gasPrice, estimate, balance] = await Promise.all([
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [this.#plan.sender, "latest"]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [this.#plan.sender, "pending"]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_gasPrice", []).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_estimateGas", [{ from: this.#plan.sender, to: approved.to, value: `0x${BigInt(approved.valueWei).toString(16)}`, data: approved.data }, "latest"]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getBalance", [this.#plan.sender, "latest"]).then(BigInt),
    ]);
    const nonce = BigInt(approved.nonce);
    const gas = BigInt(approved.gasLimitWei);
    const approvedGasPrice = BigInt(approved.gasPriceWei);
    requireThat(latestNonce === pendingNonce && latestNonce === nonce, "Arc Mainnet nonce differs from the approved transaction; preserve the journal and reconcile first");
    requireThat(gasPrice > 0n && gasPrice <= approvedGasPrice && approvedGasPrice <= budget.maxGasPriceWei, "Arc Mainnet gas price changed above the approved transaction limit");
    requireThat(estimate > 0n && estimate <= gas, "Arc Mainnet transfer estimate exceeds the fixed native-transfer gas limit");
    const maxGasCostWei = BigInt(approved.maxGasCostWei);
    requireThat(budget.alreadySpentGasWei + maxGasCostWei <= budget.maxAggregateGasWei, "Arc Mainnet worst-case gas exceeds the approved aggregate limit");
    requireThat(balance >= BigInt(this.#plan.amountWei) + maxGasCostWei, "Arc Mainnet payer balance cannot cover the exact transfer and bounded gas");
    requireThat(approved.kind === "business_transfer" && approved.to === this.#plan.recipient && approved.valueWei === this.#plan.amountWei && approved.data === "0x", "Approved Mainnet transaction differs from the purchased artifact");
    const unsigned: ArcUnsignedEvmTransaction = Object.freeze({
      chainId: ARC_MAINNET_CHAIN_ID,
      nonce,
      gas,
      gasPrice: approvedGasPrice,
      to: approved.to,
      value: BigInt(this.#plan.amountWei),
      data: approved.data,
    });
    const reviewedTransaction = Object.freeze({ ...unsigned });
    const base = this.#wallet.reviewTransfer(transfer);
    const review: CircleCommandReview = immutableSnapshot({
      ...base,
      command: ["Arc Mainnet signed transaction"],
      summary: `Arc Mainnet ${this.#plan.amountUsdc} USDC transfer from ${this.#plan.sender} to ${this.#plan.recipient}; nonce ${nonce}; ${gas} gas at ${approvedGasPrice} wei; maximum aggregate gas ${budget.maxAggregateGasWei} wei`,
      transaction: {
        nonce: nonce.toString(), to: approved.to, valueWei: this.#plan.amountWei,
        data: approved.data, gasLimitWei: gas.toString(),
        gasPriceWei: approvedGasPrice.toString(), maxGasCostWei: maxGasCostWei.toString(),
      },
    });
    if (!(await confirm(review))) throw new Error("Arc Mainnet transaction rejected by the reviewer");
    const rawTransaction = await this.#wallet.signTransaction(unsigned);
    const parsed = parseTransaction(rawTransaction) as Record<string, any>;
    const signer = await recoverTransactionAddress({ serializedTransaction: rawTransaction as TransactionSerialized<"legacy"> });
    requireThat(
      signer.toLowerCase() === this.#plan.sender.toLowerCase() && parsed.type === "legacy" &&
      BigInt(parsed.chainId) === BigInt(reviewedTransaction.chainId) && BigInt(parsed.nonce) === reviewedTransaction.nonce &&
      parsed.to?.toLowerCase() === reviewedTransaction.to.toLowerCase() && BigInt(parsed.value) === reviewedTransaction.value &&
      String(parsed.data ?? "0x").toLowerCase() === reviewedTransaction.data && BigInt(parsed.gas) === reviewedTransaction.gas && BigInt(parsed.gasPrice) === reviewedTransaction.gasPrice,
      "Signed Arc Mainnet transaction differs from the reviewed recipient, amount, nonce, chain, or gas bound",
    );
    const transactionHash = keccak256(rawTransaction);
    const circle: CircleTransferResult = {
      transactionHash,
      state: "broadcast_pending",
      raw: { rawTransaction, nonce: unsigned.nonce.toString(), gas: gas.toString(), gasPriceWei: gasPrice.toString(), maxGasCostWei: maxGasCostWei.toString() },
    };
    state.circle = circle;
    state.phase = "submission_pending";
    await this.saveExecution(state);
    const accepted = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_sendRawTransaction", [rawTransaction]);
    requireThat(typeof accepted === "string" && accepted.toLowerCase() === transactionHash.toLowerCase(), "Arc RPC returned a different hash; original signed transaction remains journaled");
    circle.state = "submitted";
    state.circle = circle;
    state.phase = "circle_submitted";
    await this.saveExecution(state);
    return circle;
  }
}

class ArcExecutionQuote {
  readonly #preview: TaskQuotePreview;
  readonly #request: TaskRequest;
  readonly #amountUsdc: string;
  readonly #reference: string;
  readonly #client: TaskClient;
  readonly #wallet: CircleArcWallet;
  readonly #rpcUrl: string;
  readonly #setPurchaseApproval: (approval?: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>) => void;
  readonly #rpcFetch: typeof fetch;
  readonly #gasBudget?: ArcExecutionGasBudget;

  get preview(): TaskQuotePreview {
    return this.#preview;
  }

  constructor(
    capability: typeof arcExecutionKitCapability,
    preview: TaskQuotePreview,
    request: TaskRequest,
    amountUsdc: string,
    reference: string,
    client: TaskClient,
    wallet: CircleArcWallet,
    rpcUrl: string,
    setPurchaseApproval: (approval?: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>) => void,
    rpcFetch: typeof fetch = fetch,
    gasBudget?: ArcExecutionGasBudget,
  ) {
    requireThat(capability === arcExecutionKitCapability, "Execution quotes can only be created from ArcExecutionKit");
    this.#preview = immutableSnapshot(preview);
    this.#request = immutableSnapshot(request);
    this.#amountUsdc = amountUsdc;
    this.#reference = reference;
    this.#client = client;
    this.#wallet = wallet;
    this.#rpcUrl = rpcUrl;
    this.#setPurchaseApproval = setPurchaseApproval;
    this.#rpcFetch = rpcFetch;
    this.#gasBudget = gasBudget && Object.freeze({ ...gasBudget });
    Object.freeze(this);
  }

  private now() {
    return this.#client.options.now?.() ?? Math.floor(Date.now() / 1_000);
  }

  private async fundingJournal(): Promise<ArcMainnetFundingJournal | undefined> {
    try {
      return await readPrivateJson(this.#client.options.stateDirectory, "gateway-funding.json") as ArcMainnetFundingJournal;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private verifyFundingJournal(journal: ArcMainnetFundingJournal) {
    const review = journal.review;
    const targets = this.#request.constraints?.allowedTargets as string[] | undefined;
    const budget = mainnetGasBudgetPolicy(this.#gasBudget);
    requireThat(
      journal.version === 1 && journal.approvalHash === hash(stable(review)) &&
        ["approved", "funding", "funded", "purchased"].includes(journal.status) &&
        review.kind === "arc_mainnet_task_purchase" && review.chainId === ARC_MAINNET_CHAIN_ID &&
        review.taskQuote.quoteId === this.#preview.quoteId && review.taskQuote.requestHash === this.#preview.requestHash &&
        review.taskQuote.payloadHash === this.#preview.payloadHash && review.taskQuote.expiresAt === this.#preview.expiresAt &&
        review.feeMicrousd === String(this.#preview.pricing.fee_microusd) &&
        review.payer === address(this.#request.sender) && review.merchant === address(this.#client.options.recipient) &&
        review.startingGasSpentWei === budget.alreadySpentGasWei &&
        review.maxAggregateGasWei === budget.maxAggregateGasWei &&
        review.maxGasPriceWei === budget.maxGasPriceWei &&
        decimal(review.plannedWorstCaseGasWei) + decimal(review.startingGasSpentWei) <= decimal(review.maxAggregateGasWei) &&
        Boolean(targets?.[0]) &&
        review.transactions.some((transaction) => transaction.kind === "business_transfer" &&
          transaction.to === address(targets?.[0]) &&
          transaction.valueWei === String(this.#request.constraints?.maxOutgoingUsdcWei) && transaction.data === "0x"),
      "Existing Gateway funding approval differs from the exact Mainnet quote and requested transfer",
    );
  }

  private async mainnetReview(): Promise<ArcMainnetTaskReview> {
    const existing = await this.fundingJournal();
    if (existing) {
      this.verifyFundingJournal(existing);
      return immutableSnapshot(existing.review);
    }
    const budget = this.#gasBudget;
    requireThat(this.#wallet.transactionSigner, "Arc Mainnet requires an explicit signer for approval, deposit, and the reviewed business transaction");
    requireThat(budget, "Arc Mainnet requires an explicit aggregate gas budget");
    mainnetGasBudgetPolicy(budget);
    requireThat(this.#client.options.maxFeeMicrousd <= 1_100_000n, "Arc Mainnet Task fee cap cannot exceed 1.1 USDC");
    requireThat(this.#preview.expiresAt > this.now() + 120, "Arc Mainnet quote expires too soon to safely fund and purchase");
    const fee = BigInt(String(this.#preview.pricing.fee_microusd));
    requireThat(fee > 0n && fee <= 1_100_000n, "Signed Arc Mainnet service fee exceeds the 1.1 USDC limit");
    const state = await readPrivateJson(this.#client.options.stateDirectory, "state.json");
    requireThat(
      state.phase === "quoted" && state.quote?.quoteId === this.#preview.quoteId &&
        state.quote?.payloadHash === this.#preview.payloadHash && state.quote?.requestHash === this.#preview.requestHash,
      "Arc Mainnet preflight is not bound to the current signed Task quote journal",
    );
    const required = JSON.parse(Buffer.from(state.requiredHeader, "base64").toString());
    const paymentNonce = required.accepts?.[0]?.extra?.aomiTaskNonce;
    requireThat(typeof paymentNonce === "string" && /^0x[0-9a-f]{64}$/.test(paymentNonce), "Arc Mainnet quote has no exact payment authorization nonce");
    await verifyArcChainId(this.#rpcUrl, ARC_MAINNET_CHAIN_ID, this.#rpcFetch);
    const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
    const payer = address(this.#wallet.walletAddress) as `0x${string}`;
    const merchant = address(this.#client.options.recipient) as `0x${string}`;
    const target = this.#request.constraints?.allowedTargets as string[] | undefined;
    requireThat(target?.length === 1, "Arc Mainnet requires exactly one reviewed business recipient");
    const recipient = address(target[0]) as `0x${string}`;
    const amountWei = BigInt(String(this.#request.constraints?.maxOutgoingUsdcWei));
    requireThat(amountWei === BigInt(usdcWei(this.#amountUsdc)), "Arc Mainnet quote request differs from the exact approved transfer amount");
    const block = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getBlockByNumber", ["latest", false]);
    requireThat(typeof block.number === "string" && typeof block.hash === "string" && /^0x[0-9a-f]{64}$/i.test(block.hash), "Arc Mainnet source block is malformed");
    const [latestNonce, pendingNonce, gasPrice, payerNative, recipientNative, payerCode, recipientCode, usdcCode, gatewayCode, usdcBalance, recipientUsdc, allowance, gateway] = await Promise.all([
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [payer, block.number]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [payer, "pending"]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_gasPrice", []).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getBalance", [payer, block.number]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getBalance", [recipient, block.number]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getCode", [payer, block.number]),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getCode", [recipient, block.number]),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getCode", [network.usdc, block.number]),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getCode", [network.gatewayWallet, block.number]),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: network.usdc, data: `0x70a08231${payer.slice(2).padStart(64, "0")}` }, block.number]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: network.usdc, data: `0x70a08231${recipient.slice(2).padStart(64, "0")}` }, block.number]).then(BigInt),
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: network.usdc, data: `0xdd62ed3e${payer.slice(2).padStart(64, "0")}${network.gatewayWallet.slice(2).padStart(64, "0")}` }, block.number]).then(BigInt),
      arcGatewayBalance(payer, this.#client.options.gatewayFetch),
    ]);
    requireThat(payerCode === "0x" && recipientCode === "0x", "Arc Mainnet bounded Task flow requires the reviewed payer and recipient to be EOAs");
    requireThat(usdcCode !== "0x" && gatewayCode !== "0x", "Official Arc Mainnet USDC or Gateway contract has no code at the pinned source block");
    requireThat(latestNonce === pendingNonce, "Arc Mainnet has an unexpected pending wallet transaction; reconcile before approval");
    requireThat(gasPrice > 0n && gasPrice <= budget.maxGasPriceWei, "Arc Mainnet gas price exceeds the approved hard cap");
    requireThat(allowance === 0n, "Untracked Gateway allowance exists; reconcile it before Mainnet approval");
    requireThat(gateway.pendingBatch == null || gateway.pendingBatch === "0", "Circle reports a pending Gateway batch; reconcile it before Mainnet funding");
    const deposit = fee > gateway.microusd ? fee - gateway.microusd : 0n;
    requireThat(deposit <= 1_100_000n, "Additional Arc Mainnet Gateway deposit exceeds 1.1 USDC");
    if (deposit > 0n) requireThat(usdcBalance >= deposit, "Arc Mainnet USDC balance cannot cover the exact Gateway deposit");
    const transactions: ArcMainnetTransactionPreview[] = [];
    let nonce = latestNonce;
    const specs: Array<{ kind: ArcMainnetTransactionPreview["kind"]; to: `0x${string}`; value: bigint; data: `0x${string}`; maxGas: bigint }> = [];
    if (deposit > 0n) {
      specs.push({
        kind: "approve",
        to: network.usdc,
        value: 0n,
        data: callData("function approve(address spender,uint256 amount) returns (bool)", [network.gatewayWallet, deposit]),
        maxGas: 100_000n,
      });
      specs.push({
        kind: "deposit",
        to: network.gatewayWallet,
        value: 0n,
        data: callData("function deposit(address token,uint256 value)", [network.usdc, deposit]),
        maxGas: 200_000n,
      });
    }
    specs.push({ kind: "business_transfer", to: recipient, value: amountWei, data: "0x", maxGas: 21_000n });
    for (const spec of specs) {
      // The deposit estimate cannot succeed before the reviewed approval is mined.
      // Reserve its fixed ceiling now, then simulate the exact deposit after approval.
      const estimate = spec.kind === "deposit" ? spec.maxGas : BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_estimateGas", [{
        from: payer, to: spec.to, value: `0x${spec.value.toString(16)}`, data: spec.data,
      }, block.number]));
      requireThat(estimate > 0n && estimate <= spec.maxGas, `Arc Mainnet ${spec.kind} gas estimate exceeds its fixed bound`);
      const gas = spec.kind === "business_transfer" || spec.kind === "deposit" ? spec.maxGas : (estimate * 120n + 99n) / 100n;
      requireThat(gas <= spec.maxGas, `Arc Mainnet ${spec.kind} safety margin exceeds its fixed bound`);
      transactions.push({
        kind: spec.kind,
        chainId: ARC_MAINNET_CHAIN_ID,
        nonce: nonce.toString(),
        to: spec.to,
        valueWei: spec.value.toString(),
        data: spec.data,
        gasLimitWei: gas.toString(),
        gasPriceWei: gasPrice.toString(),
        maxGasCostWei: (gas * gasPrice).toString(),
      });
      nonce += 1n;
    }
    const plannedGas = transactions.reduce((sum, transaction) => sum + BigInt(transaction.maxGasCostWei), 0n);
    requireThat(budget.alreadySpentGasWei + plannedGas <= budget.maxAggregateGasWei, "Arc Mainnet approval, deposit, and business gas exceed the aggregate 0.1 USDC cap");
    const depositWei = deposit * 10n ** 12n;
    const tokenGas = (plannedGas + 10n ** 12n - 1n) / 10n ** 12n;
    requireThat(payerNative >= depositWei + amountWei + plannedGas + budget.alreadySpentGasWei, "Arc Mainnet native USDC cannot cover deposit, transfer, and approved maximum gas");
    requireThat(usdcBalance >= deposit + amountWei / 10n ** 12n + tokenGas, "Arc Mainnet USDC balance cannot cover the deposit, transfer, and approved gas reserve");
    return immutableSnapshot({
      kind: "arc_mainnet_task_purchase",
      taskQuote: this.#preview,
      chainId: ARC_MAINNET_CHAIN_ID,
      payer,
      merchant,
      feeMicrousd: fee.toString(),
      paymentNonce,
      initialGatewayBalanceMicrousd: gateway.microusd.toString(),
      initialAllowanceMicrousd: allowance.toString(),
      additionalDepositMicrousd: deposit.toString(),
      additionalAllowanceMicrousd: deposit.toString(),
      balances: {
        payerNativeWei: payerNative.toString(),
        payerUsdcMicrousd: usdcBalance.toString(),
        recipientNativeWei: recipientNative.toString(),
        recipientUsdcMicrousd: recipientUsdc.toString(),
      },
      sourceBlock: { number: BigInt(block.number).toString(), hash: block.hash.toLowerCase() },
      transactions,
      plannedWorstCaseGasWei: plannedGas.toString(),
      startingGasSpentWei: budget.alreadySpentGasWei.toString(),
      maxAggregateGasWei: budget.maxAggregateGasWei.toString(),
      maxGasPriceWei: budget.maxGasPriceWei.toString(),
    });
  }

  private async approveFundingReview(review: ArcMainnetTaskReview): Promise<ArcMainnetFundingJournal> {
    return withStateLock(this.#client.options.stateDirectory, "gateway-funding-lock", async () => {
      const existing = await this.fundingJournal();
      if (existing) {
        this.verifyFundingJournal(existing);
        requireThat(stable(existing.review) === stable(review), "Existing Mainnet funding review changed; preserve its original plan");
        return existing;
      }
      const journal: ArcMainnetFundingJournal = {
        version: 1,
        approvalHash: hash(stable(review)),
        review,
        approvedAt: this.now(),
        status: "approved",
        spentGasWei: "0",
        transactions: {},
      };
      await writePrivateJson(this.#client.options.stateDirectory, "gateway-funding.json", journal);
      return journal;
    });
  }

  private async saveFunding(journal: ArcMainnetFundingJournal) {
    this.verifyFundingJournal(journal);
    await writePrivateJson(this.#client.options.stateDirectory, "gateway-funding.json", journal);
  }

  private async fundTransaction(journal: ArcMainnetFundingJournal, transaction: ArcMainnetTransactionPreview) {
    const prior = journal.transactions[transaction.kind] as Record<string, any> | undefined;
    if (!prior) {
      const [latest, pending, gasPrice] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [journal.review.payer, "latest"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [journal.review.payer, "pending"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_gasPrice", []).then(BigInt),
      ]);
      requireThat(latest === pending && latest === BigInt(transaction.nonce), "Arc Mainnet funding nonce changed; keep the original quote and reconcile before signing");
      requireThat(gasPrice > 0n && gasPrice <= BigInt(transaction.gasPriceWei), "Arc Mainnet gas price rose above the approved funding transaction");
      requireThat(BigInt(transaction.gasPriceWei) <= BigInt(journal.review.maxGasPriceWei), "Arc Mainnet funding gas price exceeds the currently approved cap");
      requireThat(
        BigInt(journal.review.startingGasSpentWei) + BigInt(journal.review.plannedWorstCaseGasWei) <= BigInt(journal.review.maxAggregateGasWei),
        "Arc Mainnet funding plan exceeds the currently approved aggregate gas cap",
      );
      const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
      const allowanceData = `0xdd62ed3e${journal.review.payer.slice(2).padStart(64, "0")}${network.gatewayWallet.slice(2).padStart(64, "0")}`;
      const allowance = BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: network.usdc, data: allowanceData }, "latest"]));
      const deposit = BigInt(journal.review.additionalDepositMicrousd);
      requireThat(
        transaction.kind === "approve" ? allowance === 0n : transaction.kind === "deposit" ? allowance === deposit : true,
        "Arc Mainnet Gateway allowance differs from the approved exact funding step",
      );
      if (transaction.kind === "deposit") {
        const estimate = BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_estimateGas", [{
          from: journal.review.payer,
          to: transaction.to,
          value: `0x${BigInt(transaction.valueWei).toString(16)}`,
          data: transaction.data,
        }, "latest"]));
        requireThat(estimate > 0n && estimate <= BigInt(transaction.gasLimitWei), "Arc Mainnet approved Gateway deposit no longer passes its exact gas-bound dry-run");
      }
      const unsigned: ArcUnsignedEvmTransaction = Object.freeze({
        chainId: ARC_MAINNET_CHAIN_ID,
        nonce: BigInt(transaction.nonce),
        gas: BigInt(transaction.gasLimitWei),
        gasPrice: BigInt(transaction.gasPriceWei),
        to: transaction.to,
        value: BigInt(transaction.valueWei),
        data: transaction.data,
      });
      const rawTransaction = await this.#wallet.signTransaction(unsigned);
      const parsed = parseTransaction(rawTransaction) as Record<string, any>;
      const signer = await recoverTransactionAddress({ serializedTransaction: rawTransaction as TransactionSerialized<"legacy"> });
      const txHash = keccak256(rawTransaction);
      requireThat(
        signer.toLowerCase() === journal.review.payer.toLowerCase() && parsed.type === "legacy" &&
          BigInt(parsed.chainId) === BigInt(transaction.chainId) && BigInt(parsed.nonce) === BigInt(transaction.nonce) &&
          parsed.to?.toLowerCase() === transaction.to.toLowerCase() && BigInt(parsed.value ?? 0n) === BigInt(transaction.valueWei) &&
          String(parsed.data ?? "0x").toLowerCase() === transaction.data.toLowerCase() &&
          BigInt(parsed.gas) === BigInt(transaction.gasLimitWei) && BigInt(parsed.gasPrice) === BigInt(transaction.gasPriceWei),
        `Signed Arc Mainnet ${transaction.kind} differs from the approved preview`,
      );
      journal.transactions[transaction.kind] = { phase: "signed", hash: txHash, rawTransaction, preview: transaction };
      journal.status = "funding";
      await this.saveFunding(journal);
      let accepted: string | undefined;
      try {
        accepted = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_sendRawTransaction", [rawTransaction]);
      } catch {
        const [known, receipt] = await Promise.all([
          arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [txHash]),
          arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [txHash]),
        ]);
        if (!known && !receipt) throw new Error(`Arc Mainnet ${transaction.kind} outcome is uncertain; original hash and nonce are journaled; do not create a replacement`);
      }
      requireThat(!accepted || accepted.toLowerCase() === txHash.toLowerCase(), "Arc RPC returned a different hash for the approved funding transaction");
      journal.transactions[transaction.kind].phase = "submitted";
      await this.saveFunding(journal);
    } else {
      requireThat(prior.hash === keccak256(prior.rawTransaction) && stable(prior.preview) === stable(transaction), "Stored Arc Mainnet funding transaction differs from its approved original");
    }
    const item = journal.transactions[transaction.kind] as Record<string, any>;
    let verified: Record<string, any> | undefined;
    const deadline = Date.now() + 60_000;
    while (!verified && Date.now() < deadline) {
      const [mined, receipt] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [item.hash]),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [item.hash]),
      ]);
      if (mined && receipt) {
        const parsed = parseTransaction(item.rawTransaction) as Record<string, any>;
        const signer = await recoverTransactionAddress({ serializedTransaction: item.rawTransaction as TransactionSerialized<"legacy"> });
        const gasUsed = BigInt(receipt.gasUsed);
        const effectiveGasPrice = BigInt(receipt.effectiveGasPrice ?? mined.gasPrice);
        const gasCostWei = gasUsed * effectiveGasPrice;
        requireThat(
          signer.toLowerCase() === journal.review.payer.toLowerCase() && parsed.type === "legacy" &&
            keccak256(item.rawTransaction).toLowerCase() === item.hash.toLowerCase() &&
            String(mined.hash).toLowerCase() === item.hash.toLowerCase() && BigInt(mined.chainId) === BigInt(transaction.chainId) &&
            BigInt(mined.nonce) === BigInt(transaction.nonce) && address(mined.from) === journal.review.payer &&
            address(mined.to) === transaction.to && BigInt(mined.value) === BigInt(transaction.valueWei) &&
            String(mined.input ?? mined.data).toLowerCase() === transaction.data.toLowerCase() &&
            BigInt(mined.gas) === BigInt(transaction.gasLimitWei) && BigInt(mined.gasPrice) === BigInt(transaction.gasPriceWei) &&
            String(receipt.transactionHash).toLowerCase() === item.hash.toLowerCase() && receipt.status === "0x1" &&
            gasUsed > 0n && gasUsed <= BigInt(transaction.gasLimitWei) && effectiveGasPrice <= BigInt(transaction.gasPriceWei),
          `Arc Mainnet ${transaction.kind} receipt differs from the original approved transaction`,
        );
        verified = {
          transactionHash: item.hash,
          blockNumber: BigInt(receipt.blockNumber).toString(),
          blockHash: receipt.blockHash,
          gasUsed: gasUsed.toString(),
          effectiveGasPriceWei: effectiveGasPrice.toString(),
          gasCostWei: gasCostWei.toString(),
          status: "0x1",
        };
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    requireThat(verified, `Arc Mainnet ${transaction.kind} remains unresolved; retain its original hash and do not replace it`);
    if (item.phase === "confirmed") {
      requireThat(stable(item.receipt) === stable(verified), "Arc Mainnet funding receipt changed during recovery");
    } else {
      item.phase = "confirmed";
      item.receipt = verified;
      journal.spentGasWei = Object.values(journal.transactions)
        .filter((entry: any) => entry.phase === "confirmed")
        .reduce((sum: bigint, entry: any) => sum + BigInt(entry.receipt.gasCostWei), 0n)
        .toString();
      requireThat(BigInt(journal.spentGasWei) <= BigInt(journal.review.maxAggregateGasWei), "Arc Mainnet actual funding gas exceeds the approved aggregate cap");
      await this.saveFunding(journal);
    }
  }

  private async fundGateway(journal: ArcMainnetFundingJournal) {
    return withStateLock(this.#client.options.stateDirectory, "gateway-funding-lock", async () => {
      const persisted = await this.fundingJournal();
      requireThat(persisted, "Approved Arc Mainnet Gateway funding journal is missing; reconcile before payment");
      this.verifyFundingJournal(persisted);
      requireThat(persisted.approvalHash === journal.approvalHash, "Arc Mainnet Gateway approval journal changed");
      const transactions = persisted.review.transactions.filter((transaction) => transaction.kind !== "business_transfer");
      for (const transaction of transactions) await this.fundTransaction(persisted, transaction);
      const allowanceData = `0xdd62ed3e${persisted.review.payer.slice(2).padStart(64, "0")}${arcNetwork(ARC_MAINNET_CHAIN_ID).gatewayWallet.slice(2).padStart(64, "0")}`;
      const allowance = BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: arcNetwork(ARC_MAINNET_CHAIN_ID).usdc, data: allowanceData }, "latest"]));
      requireThat(allowance === 0n, "Arc Mainnet Gateway deposit did not consume the exact approved allowance");
      const taskState = await readPrivateJson(this.#client.options.stateDirectory, "state.json");
      if (!taskState.paymentSignature) {
        const gateway = await arcGatewayBalance(persisted.review.payer, this.#client.options.gatewayFetch);
        requireThat(
          (gateway.pendingBatch == null || gateway.pendingBatch === "0") &&
            gateway.microusd >= BigInt(persisted.review.feeMicrousd),
          "Circle Gateway available balance does not cover the exact signed Task fee",
        );
      }
      const business = persisted.review.transactions.find((transaction) => transaction.kind === "business_transfer");
      requireThat(business, "Arc Mainnet funding journal has no reviewed business transaction");
      const [latest, pending] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [persisted.review.payer, "latest"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [persisted.review.payer, "pending"]).then(BigInt),
      ]);
      requireThat(latest === pending && latest === BigInt(business.nonce), "Arc Mainnet business nonce differs from the approved preview after funding");
      requireThat(this.#preview.expiresAt > this.now() + 30, "Task quote expired during Gateway funding; preserve the original funding journal and do not sign payment");
      persisted.status = "funded";
      persisted.spentGasWei = Object.values(persisted.transactions)
        .filter((entry: any) => entry.phase === "confirmed")
        .reduce((sum: bigint, entry: any) => sum + BigInt(entry.receipt.gasCostWei), 0n)
        .toString();
      await this.saveFunding(persisted);
      journal.status = "funded";
      journal.spentGasWei = persisted.spentGasWei;
      journal.transactions = persisted.transactions;
      return persisted;
    });
  }

  async purchase(confirm: (preview: ArcExecutionApproval) => boolean | Promise<boolean>): Promise<ArcPurchasedArtifact | { status: "pending" }> {
    let mainnetReview: ArcMainnetTaskReview | undefined;
    let mainnetFunding: ArcMainnetFundingJournal | undefined;
    const mainnetApproved = this.#request.chainId === ARC_MAINNET_CHAIN_ID;
    if (mainnetApproved) {
      mainnetReview = await this.mainnetReview();
      mainnetFunding = await this.fundingJournal();
      if (mainnetFunding) {
        this.verifyFundingJournal(mainnetFunding);
      } else {
        if (!(await confirm(mainnetReview))) throw new Error("Arc Mainnet funding and Task purchase rejected by the reviewer");
        mainnetFunding = await this.approveFundingReview(mainnetReview);
      }
      mainnetFunding = await this.fundGateway(mainnetFunding);
      await this.#client[markTaskGatewayFundingReady](mainnetReview.taskQuote.quoteId, mainnetReview.feeMicrousd, mainnetFunding.approvalHash);
    } else if (!(await confirm(this.#preview))) {
      throw new Error("Aomi service purchase rejected by the reviewer");
    }
    this.#setPurchaseApproval(() => true);
    try {
      const result = await this.#client.purchase(this.#request);
      if (result.status === "pending") return result;
      const plan = parseArcTransferArtifact(result.bytes, this.#request, this.#preview, this.#amountUsdc, undefined, this.#reference);
      await this.#client[initializeTaskExecutionLedger](plan.artifactHash, result.receipt);
      let gasBudget = this.#gasBudget;
      let approvedBusinessTransaction: ArcMainnetTransactionPreview | undefined;
      if (plan.chainId === ARC_MAINNET_CHAIN_ID) {
        requireThat(result.settlement?.status === "confirmed", "Arc Mainnet Gateway settlement must be independently confirmed before artifact execution");
        requireThat(gasBudget && mainnetFunding && mainnetReview, "Arc Mainnet requires its original funding and gas approval journal");
        approvedBusinessTransaction = mainnetReview.transactions.find((transaction) => transaction.kind === "business_transfer");
        requireThat(
          approvedBusinessTransaction && plan.chainId === approvedBusinessTransaction.chainId &&
            plan.sender === mainnetReview.payer && plan.recipient === approvedBusinessTransaction.to &&
            plan.amountWei === approvedBusinessTransaction.valueWei && approvedBusinessTransaction.data === "0x",
          "Purchased artifact differs from the exact pre-purchase Mainnet transaction preview; preserve the paid artifact and do not execute",
        );
        const payerSettlementGasWei = result.settlement.transactionSender === mainnetReview.payer
          ? BigInt(result.settlement.gasCostWei)
          : 0n;
        const alreadySpentGasWei = gasBudget.alreadySpentGasWei + BigInt(mainnetFunding.spentGasWei) + payerSettlementGasWei;
        gasBudget = { ...gasBudget, alreadySpentGasWei };
        mainnetGasBudgetPolicy(gasBudget);
        requireThat(alreadySpentGasWei + BigInt(approvedBusinessTransaction.maxGasCostWei) <= gasBudget.maxAggregateGasWei, "Confirmed funding and Gateway settlement leave insufficient gas reserve for the approved business transaction");
        mainnetFunding.status = "purchased";
        mainnetFunding.artifactHash = plan.artifactHash;
        mainnetFunding.paymentReceipt = immutableSnapshot(result.receipt);
        await this.saveFunding(mainnetFunding);
      }
      return new ArcPurchasedArtifact(
        arcExecutionKitCapability,
        plan,
        result.receipt,
        this.#wallet,
        this.#rpcUrl,
        this.#client.options.stateDirectory,
        (checkpoint) => this.#client[taskExecutionCheckpoint](plan.artifactHash, checkpoint),
        this.#rpcFetch,
        gasBudget,
        mainnetApproved,
        approvedBusinessTransaction,
      );
    } finally {
      this.#setPurchaseApproval(undefined);
    }
  }
}

export class ArcExecutionKit {
  readonly options: ArcExecutionKitOptions;
  readonly chainId: ArcChainId;

  private constructor(options: ArcExecutionKitOptions, chainId: ArcChainId) {
    const wallet = Object.freeze(new CircleArcWallet({
      walletAddress: options.wallet.walletAddress,
      command: options.wallet.command,
      runner: options.wallet.runner,
      transactionSigner: options.wallet.transactionSigner,
    }));
    this.options = immutableSnapshot({ ...options, wallet });
    this.chainId = chainId;
    Object.freeze(this);
  }

  static arcTestnet(options: ArcExecutionKitOptions) {
    return new ArcExecutionKit(options, ARC_TESTNET_CHAIN_ID);
  }

  static arcMainnet(options: ArcExecutionKitOptions) {
    return new ArcExecutionKit(options, ARC_MAINNET_CHAIN_ID);
  }

  async prepare(
    intent: ArcPaymentIntent,
    authorizeTask: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>,
  ): Promise<ArcExecutionQuote> {
    await verifyArcChainId(this.options.rpcUrl, this.chainId, this.options.rpcFetch);
    if (this.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(this.options.wallet.transactionSigner, "Arc Mainnet requires an explicit signer for the exact bounded business transaction");
      mainnetGasBudgetPolicy(this.options.gasBudget);
      requireThat(this.options.maxFeeMicrousd <= 1_100_000n, "Arc Mainnet Task fee cap cannot exceed 1.1 USDC");
    }
    requireThat(address(intent.sender) === address(this.options.wallet.walletAddress), "Circle wallet must be the selected sender");
    requireThat(Boolean(intent.reference.trim()) && intent.reference.length <= 120, "A short payment reference is required");
    const recipient = address(intent.recipient);
    const amountWei = usdcWei(intent.amountUsdc);
    const request: TaskRequest = {
      intent: intent.intent,
      chainId: this.chainId,
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
      arcExecutionKitCapability,
      preview,
      request,
      intent.amountUsdc,
      intent.reference,
      client,
      this.options.wallet,
      this.options.rpcUrl,
      (approval) => { purchaseApproval = approval; },
      this.options.rpcFetch,
      this.options.gasBudget,
    );
  }
}
