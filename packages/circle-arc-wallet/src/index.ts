import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { encodeFunctionData, parseAbiItem } from "viem";

export const ARC_TESTNET = "ARC-TESTNET";
export const ARC_TESTNET_CHAIN_ID = 5_042_002;

const EIP712_DOMAIN_FIELDS = [
  ["name", "string"],
  ["version", "string"],
  ["chainId", "uint256"],
  ["verifyingContract", "address"],
  ["salt", "bytes32"],
] as const;

export interface ArcTransferPlan {
  chainId: typeof ARC_TESTNET_CHAIN_ID;
  recipient: `0x${string}`;
  amountUsdc: string;
  invoiceId: string;
  idempotencyKey: string;
}

export interface CircleCommandReview {
  title: string;
  summary: string;
  command: readonly string[];
  chainId: number;
  walletAddress: `0x${string}`;
  recipient: `0x${string}`;
  amountUsdc: string;
  invoiceId: string;
}

export interface CircleTransferResult {
  transactionId?: string;
  transactionHash?: `0x${string}`;
  state?: string;
  raw: unknown;
}

export interface CircleContractCallPlan {
  chainId: typeof ARC_TESTNET_CHAIN_ID;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  abiFunctionSignature: string;
  abiParameters: readonly string[];
  idempotencyKey: string;
  label: string;
}

export interface CircleContractCallReview {
  title: string;
  summary: string;
  command: readonly string[];
  chainId: number;
  walletAddress: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
}

export interface ArcReceipt {
  transactionHash: `0x${string}`;
  blockNumber: `0x${string}`;
  status: "0x1";
  logs: readonly Record<string, unknown>[];
}

export interface ArcTransferReceipt extends ArcReceipt {
  from: `0x${string}`;
  to: `0x${string}`;
  value: `0x${string}`;
  input: "0x";
}

export type ArcCallReceipt = ArcReceipt;

export type CommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type ReviewCallback = (review: CircleCommandReview) => boolean | Promise<boolean>;

function address(value: string): `0x${string}` {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) throw new Error("Expected a 20-byte EVM address");
  return value.toLowerCase() as `0x${string}`;
}

function amount(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) {
    throw new Error("USDC amount must be a non-negative decimal with at most six decimals");
  }
  if (Number(value) <= 0) throw new Error("USDC amount must be positive");
  return value;
}

function nativeAmount(valueWei: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(valueWei)) throw new Error("Contract value must be decimal wei");
  const wei = BigInt(valueWei);
  const unit = 10n ** 18n;
  const whole = wei / unit;
  const fraction = (wei % unit).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function circleIdempotencyKey(seed: string): string {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(seed)) throw new Error("Use an explicit stable idempotency key");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seed)) return seed.toLowerCase();
  const digest = createHash("sha1")
    .update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex"))
    .update(seed)
    .digest("hex");
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Circle CLI returned no output");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Circle CLI did not return JSON output");
  }
}

function circleTypedData(typedData: unknown): unknown {
  if (!typedData || typeof typedData !== "object" || Array.isArray(typedData)) {
    throw new Error("EIP-712 typed data must be an object");
  }
  const input = typedData as Record<string, unknown>;
  const domain = input.domain;
  const types = input.types;
  if (!domain || typeof domain !== "object" || Array.isArray(domain)
    || !types || typeof types !== "object" || Array.isArray(types)) {
    throw new Error("EIP-712 typed data requires domain and types objects");
  }
  const domainRecord = domain as Record<string, unknown>;
  return {
    ...input,
    types: {
      EIP712Domain: EIP712_DOMAIN_FIELDS
        .filter(([name]) => domainRecord[name] !== undefined)
        .map(([name, type]) => ({ name, type })),
      ...types as Record<string, unknown>,
    },
  };
}

function readString(record: unknown, keys: readonly string[]): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const value = record as Record<string, unknown>;
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  for (const nested of [value.data, value.transaction, value.result]) {
    const found = readString(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["transactions", "items", "data", "result"]) {
    const nested = records(record[key]);
    if (nested.length) return nested;
  }
  return [record];
}

export function normalizeCircleTransferResult(raw: unknown): CircleTransferResult {
  const hash = readString(raw, ["transactionHash", "txHash", "tx_hash", "hash"]);
  if (hash && !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Circle returned an invalid transaction hash");
  return {
    transactionId: readString(raw, ["transactionId", "transaction_id", "id"]),
    transactionHash: hash?.toLowerCase() as `0x${string}` | undefined,
    state: readString(raw, ["state", "status"]),
    raw,
  };
}

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Circle CLI exited ${code}: ${stderr.trim() || "unknown error"}`));
    });
  });

export class CircleArcWallet {
  readonly walletAddress: `0x${string}`;
  readonly command: string;
  readonly runner: CommandRunner;

  constructor(options: {
    walletAddress: string;
    command?: string;
    runner?: CommandRunner;
  }) {
    this.walletAddress = address(options.walletAddress);
    this.command = options.command ?? "circle";
    this.runner = options.runner ?? runCommand;
  }

  async gatewayPayer(): Promise<`0x${string}`> {
    const { stdout } = await this.runner(this.command, [
      "gateway",
      "balance",
      "--address",
      this.walletAddress,
      "--chain",
      ARC_TESTNET,
      "--output",
      "json",
    ]);
    const balance = parseJsonOutput(stdout);
    const account = readString(balance, ["address", "walletAddress", "wallet_address"]);
    if (!account || address(account) !== this.walletAddress) {
      throw new Error("Circle Gateway balance response does not match the agent wallet");
    }
    const payer = readString(balance, ["backingEOA", "backingEoa", "backing_eoa"]);
    if (!payer) throw new Error("Circle Gateway did not return the agent wallet backing EOA");
    return address(payer);
  }

  reviewTransfer(plan: ArcTransferPlan): CircleCommandReview {
    if (plan.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Only Arc Testnet is supported");
    const recipient = address(plan.recipient);
    const amountUsdc = amount(plan.amountUsdc);
    if (!plan.invoiceId.trim()) throw new Error("invoiceId is required");
    const idempotencyKey = circleIdempotencyKey(plan.idempotencyKey);
    const command = [
      "wallet",
      "transfer",
      recipient,
      "--amount",
      amountUsdc,
      "--address",
      this.walletAddress,
      "--chain",
      ARC_TESTNET,
      "--idempotency-key",
      idempotencyKey,
      "--output",
      "json",
    ] as const;
    return {
      title: `Pay ${plan.invoiceId}`,
      summary: `Send ${amountUsdc} native USDC on Arc Testnet to ${recipient}`,
      command,
      chainId: plan.chainId,
      walletAddress: this.walletAddress,
      recipient,
      amountUsdc,
      invoiceId: plan.invoiceId,
    };
  }

  async transfer(plan: ArcTransferPlan, confirm: ReviewCallback): Promise<CircleTransferResult> {
    const review = this.reviewTransfer(plan);
    if (!(await confirm(review))) throw new Error("Circle wallet transfer rejected by the reviewer");
    const { stdout } = await this.runner(this.command, review.command);
    return normalizeCircleTransferResult(parseJsonOutput(stdout));
  }

  reviewContractCall(plan: CircleContractCallPlan): CircleContractCallReview {
    if (plan.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Only Arc Testnet is supported");
    const to = address(plan.to);
    if (!/^0x(?:[0-9a-f]{2})*$/i.test(plan.data)) throw new Error("Contract calldata must be hex bytes");
    const executionAmount = nativeAmount(plan.value);
    const idempotencyKey = circleIdempotencyKey(plan.idempotencyKey);
    const item = parseAbiItem(`function ${plan.abiFunctionSignature}`);
    const encoded = encodeFunctionData({ abi: [item], args: plan.abiParameters });
    if (encoded.toLowerCase() !== plan.data.toLowerCase()) throw new Error("ABI parameters do not reproduce the exact Aomi calldata");
    const command = [
      "wallet", "execute", plan.abiFunctionSignature, ...plan.abiParameters,
      "--contract", to,
      "--address", this.walletAddress,
      "--chain", ARC_TESTNET,
      "--amount", executionAmount,
      "--idempotency-key", idempotencyKey,
      "--output", "json",
    ] as const;
    return {
      title: plan.label,
      summary: `Execute exact ${plan.data.slice(0, 10)} call on ${to} with ${executionAmount} native token (${plan.value} wei)`,
      command,
      chainId: plan.chainId,
      walletAddress: this.walletAddress,
      to,
      data: plan.data.toLowerCase() as `0x${string}`,
      value: plan.value,
    };
  }

  async executeContractCall(
    plan: CircleContractCallPlan,
    confirm: (review: CircleContractCallReview) => boolean | Promise<boolean>,
  ): Promise<CircleTransferResult> {
    const review = this.reviewContractCall(plan);
    if (!(await confirm(review))) throw new Error("Circle contract execution rejected by the reviewer");
    const { stdout } = await this.runner(this.command, review.command);
    return normalizeCircleTransferResult(parseJsonOutput(stdout));
  }

  async transaction(transactionId: string, operation?: "transfer" | "contract_execution"): Promise<CircleTransferResult | undefined> {
    const args = [
      "transaction", "list",
      "--address", this.walletAddress,
      "--chain", ARC_TESTNET,
    ];
    if (operation) args.push("--operation", operation);
    args.push("--output", "json");
    const { stdout } = await this.runner(this.command, [
      ...args,
    ]);
    const found = records(parseJsonOutput(stdout)).find((item) =>
      readString(item, ["transactionId", "transaction_id", "id"]) === transactionId);
    return found ? normalizeCircleTransferResult(found) : undefined;
  }

  async waitForConfirmation(
    transactionId: string,
    options: { timeoutMs?: number; pollIntervalMs?: number; sleep?: (milliseconds: number) => Promise<void> } = {},
  ): Promise<CircleTransferResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const transaction = await this.transaction(transactionId);
      const state = transaction?.state?.toLowerCase();
      if (transaction && ["confirmed", "complete", "cleared"].includes(state ?? "")) {
        if (!transaction.transactionHash) throw new Error("Circle marked the transfer complete without an Arc transaction hash");
        return transaction;
      }
      if (transaction && ["failed", "cancelled", "denied", "stuck"].includes(state ?? "")) {
        throw new Error(`Circle transfer ended in terminal state ${transaction.state}`);
      }
      await sleep(pollIntervalMs);
    }
    throw new Error("Timed out waiting for Circle to confirm the Arc transfer; retain the idempotency key and reconcile the existing transaction");
  }

  async signTypedData(
    typedData: unknown,
    confirm: (review: { title: string; typedData: unknown; walletAddress: string }) => boolean | Promise<boolean>,
  ): Promise<`0x${string}`> {
    const primaryType = (typedData as { primaryType?: unknown } | null)?.primaryType;
    const title = primaryType === "TaskAuthorization"
      ? "Authorize this exact Aomi Task request"
      : primaryType === "TransferWithAuthorization"
        ? "Authorize the Aomi Task service payment"
        : "Authorize typed data";
    if (!(await confirm({ title, typedData, walletAddress: this.walletAddress }))) {
      throw new Error("Circle wallet signature rejected by the reviewer");
    }
    const { stdout } = await this.runner(this.command, [
      "wallet",
      "sign",
      "typed-data",
      JSON.stringify(circleTypedData(typedData), (_, value) => (typeof value === "bigint" ? value.toString() : value)),
      "--address",
      this.walletAddress,
      "--chain",
      ARC_TESTNET,
      "--quiet",
    ]);
    const signature = stdout.trim();
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(signature) || signature.length < 132 || signature.length > 32_770) throw new Error("Circle returned an invalid EIP-712 signature");
    return signature.toLowerCase() as `0x${string}`;
  }
}

export async function verifyArcReceipt(
  transactionHash: string,
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ArcReceipt> {
  if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error("Invalid Arc transaction hash");
  if (!rpcUrl.startsWith("https://") && !rpcUrl.startsWith("http://127.0.0.1:") && !rpcUrl.startsWith("http://localhost:")) {
    throw new Error("Arc RPC must use HTTPS (loopback HTTP is allowed)");
  }
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [transactionHash] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json() as { result?: Record<string, unknown>; error?: unknown };
  if (body.error || !body.result) throw new Error("Arc receipt is not confirmed yet");
  const hash = readString(body.result, ["transactionHash"]);
  const blockNumber = readString(body.result, ["blockNumber"]);
  const status = readString(body.result, ["status"]);
  if (hash?.toLowerCase() !== transactionHash.toLowerCase() || !/^0x[0-9a-f]+$/i.test(blockNumber ?? "") || status !== "0x1") {
    throw new Error("Arc receipt did not prove a successful transaction");
  }
  const rawLogs = body.result.logs;
  if (rawLogs !== undefined && (!Array.isArray(rawLogs) || !rawLogs.every((log) => Boolean(log) && typeof log === "object" && !Array.isArray(log)))) {
    throw new Error("Arc receipt contains malformed logs");
  }
  return {
    transactionHash: hash.toLowerCase() as `0x${string}`,
    blockNumber: blockNumber as `0x${string}`,
    status: "0x1",
    logs: rawLogs as Record<string, unknown>[] | undefined ?? [],
  };
}

export async function verifyArcTransferReceipt(
  transactionHash: string,
  rpcUrl: string,
  expected: { from: string; to: string; valueWei: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ArcTransferReceipt> {
  const receipt = await verifyArcReceipt(transactionHash, rpcUrl, fetchImpl);
  const from = address(expected.from);
  const to = address(expected.to);
  if (!/^(0|[1-9][0-9]*)$/.test(expected.valueWei)) throw new Error("Expected transfer value must be decimal wei");
  const value = `0x${BigInt(expected.valueWei).toString(16)}` as `0x${string}`;
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [transactionHash] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json() as { result?: Record<string, unknown>; error?: unknown };
  if (body.error || !body.result) throw new Error("Arc transaction is not available");
  const actualHash = readString(body.result, ["hash"]);
  const actualFrom = readString(body.result, ["from"]);
  const actualTo = readString(body.result, ["to"]);
  const actualValue = readString(body.result, ["value"]);
  const input = readString(body.result, ["input"]);
  if (
    actualHash?.toLowerCase() !== receipt.transactionHash ||
    actualFrom?.toLowerCase() !== from ||
    actualTo?.toLowerCase() !== to ||
    actualValue?.toLowerCase() !== value ||
    input !== "0x"
  ) {
    throw new Error("Arc transaction does not match the reviewed native transfer");
  }
  return { ...receipt, from, to, value, input: "0x" };
}

export async function verifyArcCallReceipt(
  transactionHash: string,
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ArcCallReceipt> {
  return verifyArcReceipt(transactionHash, rpcUrl, fetchImpl);
}
