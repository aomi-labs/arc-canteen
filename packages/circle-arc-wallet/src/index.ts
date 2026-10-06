import { spawn } from "node:child_process";

export const ARC_TESTNET = "ARC-TESTNET";
export const ARC_TESTNET_CHAIN_ID = 5_042_002;

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

export interface ArcReceipt {
  transactionHash: `0x${string}`;
  blockNumber: `0x${string}`;
  status: "0x1";
}

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

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Circle CLI returned no output");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Circle CLI did not return JSON output");
  }
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

  reviewTransfer(plan: ArcTransferPlan): CircleCommandReview {
    if (plan.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Only Arc Testnet is supported");
    const recipient = address(plan.recipient);
    const amountUsdc = amount(plan.amountUsdc);
    if (!plan.invoiceId.trim()) throw new Error("invoiceId is required");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(plan.idempotencyKey)) {
      throw new Error("Use an explicit stable idempotency key");
    }
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
      plan.idempotencyKey,
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

  async transaction(transactionId: string): Promise<CircleTransferResult | undefined> {
    const { stdout } = await this.runner(this.command, [
      "transaction",
      "list",
      "--address",
      this.walletAddress,
      "--chain",
      ARC_TESTNET,
      "--operation",
      "transfer",
      "--output",
      "json",
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
    if (!(await confirm({ title: "Authorize the Aomi Task purchase", typedData, walletAddress: this.walletAddress }))) {
      throw new Error("Circle wallet signature rejected by the reviewer");
    }
    const { stdout } = await this.runner(this.command, [
      "wallet",
      "sign",
      "typed-data",
      JSON.stringify(typedData, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
      "--address",
      this.walletAddress,
      "--chain",
      ARC_TESTNET,
      "--quiet",
    ]);
    const signature = stdout.trim();
    if (!/^0x[0-9a-f]{130}$/i.test(signature)) throw new Error("Circle returned an invalid EIP-712 signature");
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
  return {
    transactionHash: hash.toLowerCase() as `0x${string}`,
    blockNumber: blockNumber as `0x${string}`,
    status: "0x1",
  };
}
