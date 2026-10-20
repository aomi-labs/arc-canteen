import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, keccak256, parseAbiItem, parseAbiParameters, stringToHex } from "viem";

export const ARC_TESTNET = "ARC-TESTNET";
export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_MAINNET = "ARC";
export const ARC_MAINNET_CHAIN_ID = 5_042;

export type ArcChainId = typeof ARC_TESTNET_CHAIN_ID | typeof ARC_MAINNET_CHAIN_ID;

export type ArcNetwork = Readonly<{
  chainId: ArcChainId;
  circleChain: typeof ARC_TESTNET | typeof ARC_MAINNET;
  displayName: "Arc Testnet" | "Arc Mainnet";
  usdc: `0x${string}`;
  gatewayWallet: `0x${string}`;
  gatewayApi: string;
  gatewayDomain: 26;
}>;

const ARC_NETWORKS: Record<ArcChainId, ArcNetwork> = {
  [ARC_TESTNET_CHAIN_ID]: Object.freeze({
    chainId: ARC_TESTNET_CHAIN_ID,
    circleChain: ARC_TESTNET,
    displayName: "Arc Testnet",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
    gatewayApi: "https://gateway-api-testnet.circle.com/v1",
    gatewayDomain: 26,
  }),
  [ARC_MAINNET_CHAIN_ID]: Object.freeze({
    chainId: ARC_MAINNET_CHAIN_ID,
    circleChain: ARC_MAINNET,
    displayName: "Arc Mainnet",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee",
    gatewayApi: "https://gateway-api.circle.com/v1",
    gatewayDomain: 26,
  }),
};

export function arcNetwork(chainId: number): ArcNetwork {
  if (chainId !== ARC_TESTNET_CHAIN_ID && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(`Unsupported Arc chain id: ${chainId}`);
  }
  return ARC_NETWORKS[chainId];
}

const EIP712_DOMAIN_FIELDS = [
  ["name", "string"],
  ["version", "string"],
  ["chainId", "uint256"],
  ["verifyingContract", "address"],
  ["salt", "bytes32"],
] as const;

export interface ArcTransferPlan {
  chainId: ArcChainId;
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
  transaction?: {
    nonce: string;
    to: `0x${string}`;
    valueWei: string;
    data: "0x";
    gasLimitWei: string;
    gasPriceWei: string;
    maxGasCostWei: string;
  };
}

export interface CircleTransferResult {
  transactionId?: string;
  transactionHash?: `0x${string}`;
  state?: string;
  raw: unknown;
}

export interface ArcUnsignedNativeTransfer {
  chainId: ArcChainId;
  nonce: bigint;
  gas: bigint;
  gasPrice: bigint;
  to: `0x${string}`;
  value: bigint;
  data: "0x";
}

export interface ArcUnsignedEvmTransaction {
  chainId: ArcChainId;
  nonce: bigint;
  gas: bigint;
  gasPrice: bigint;
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
}

export type CircleGatewaySettlement =
  | { status: "pending"; transferId?: string }
  | {
      status: "confirmed";
      transferId: string;
      transactionHash: `0x${string}`;
      transactionSender: `0x${string}`;
      blockNumber: string;
      gasCostWei: string;
      batchId: `0x${string}`;
      amountVerification?: "batch_lower_bound";
    };

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
  readonly transactionSigner?: (transaction: ArcUnsignedEvmTransaction) => Promise<`0x${string}`>;

  constructor(options: {
    walletAddress: string;
    command?: string;
    runner?: CommandRunner;
    transactionSigner?: (transaction: ArcUnsignedEvmTransaction) => Promise<`0x${string}`>;
  }) {
    this.walletAddress = address(options.walletAddress);
    this.command = options.command ?? "circle";
    this.runner = options.runner ?? runCommand;
    this.transactionSigner = options.transactionSigner;
  }

  async signTransaction(transaction: ArcUnsignedEvmTransaction): Promise<`0x${string}`> {
    arcNetwork(transaction.chainId);
    if (!this.transactionSigner) throw new Error("An explicit raw-transaction signer is required for bounded Arc Mainnet execution");
    const reviewed = Object.freeze({ ...transaction });
    const signed = await this.transactionSigner(reviewed);
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(signed)) throw new Error("Transaction signer returned malformed signed bytes");
    return signed.toLowerCase() as `0x${string}`;
  }

  async gatewayPayer(chainId: ArcChainId): Promise<`0x${string}`> {
    const network = arcNetwork(chainId);
    const { stdout } = await this.runner(this.command, [
      "gateway",
      "balance",
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain,
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
    const network = arcNetwork(plan.chainId);
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
      network.circleChain,
      "--idempotency-key",
      idempotencyKey,
      "--output",
      "json",
    ] as const;
    return {
      title: `Pay ${plan.invoiceId}`,
      summary: `Send ${amountUsdc} native USDC on ${network.displayName} to ${recipient}`,
      command,
      chainId: plan.chainId,
      walletAddress: this.walletAddress,
      recipient,
      amountUsdc,
      invoiceId: plan.invoiceId,
    };
  }

  async transfer(plan: ArcTransferPlan, confirm: ReviewCallback): Promise<CircleTransferResult> {
    if (plan.chainId === ARC_MAINNET_CHAIN_ID) throw new Error("Arc Mainnet transfers require the bounded Execution Kit path");
    const review = this.reviewTransfer(plan);
    if (!(await confirm(review))) throw new Error("Circle wallet transfer rejected by the reviewer");
    const { stdout } = await this.runner(this.command, review.command);
    return normalizeCircleTransferResult(parseJsonOutput(stdout));
  }

  reviewContractCall(plan: CircleContractCallPlan): CircleContractCallReview {
    const network = arcNetwork(plan.chainId);
    if (network.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Contract calls are not supported for Arc Mainnet");
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
      "--chain", network.circleChain,
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

  async transaction(transactionId: string, chainId: ArcChainId, operation?: "transfer" | "contract_execution"): Promise<CircleTransferResult | undefined> {
    const network = arcNetwork(chainId);
    const args = [
      "transaction", "list",
      "--address", this.walletAddress,
      "--chain", network.circleChain,
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
    chainId: ArcChainId,
    options: { timeoutMs?: number; pollIntervalMs?: number; sleep?: (milliseconds: number) => Promise<void> } = {},
  ): Promise<CircleTransferResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const transaction = await this.transaction(transactionId, chainId);
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
    const normalizedTypedData = circleTypedData(typedData);
    const domain = (typedData as { domain?: { chainId?: unknown } } | null)?.domain;
    const chainId = typeof domain?.chainId === "bigint" || typeof domain?.chainId === "number" || typeof domain?.chainId === "string"
      ? Number(domain.chainId)
      : NaN;
    const network = arcNetwork(chainId);
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
      JSON.stringify(normalizedTypedData, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain,
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
  chainId: ArcChainId,
  fetchImpl: typeof fetch = fetch,
): Promise<ArcReceipt> {
  if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error("Invalid Arc transaction hash");
  await verifyArcChainId(rpcUrl, chainId, fetchImpl);
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

export async function verifyArcChainId(
  rpcUrl: string,
  chainId: ArcChainId,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  arcNetwork(chainId);
  if (!rpcUrl.startsWith("https://") && !rpcUrl.startsWith("http://127.0.0.1:") && !rpcUrl.startsWith("http://localhost:")) {
    throw new Error("Arc RPC must use HTTPS (loopback HTTP is allowed)");
  }
  const chainResponse = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!chainResponse.ok) throw new Error(`Arc RPC returned ${chainResponse.status}`);
  const chainBody = await chainResponse.json() as { result?: unknown; error?: unknown };
  if (chainBody.error || typeof chainBody.result !== "string" || BigInt(chainBody.result) !== BigInt(chainId)) {
    throw new Error(`Arc RPC chain id does not match the selected chain ${chainId}`);
  }
}

export async function verifyArcTransferReceipt(
  transactionHash: string,
  rpcUrl: string,
  chainId: ArcChainId,
  expected: { from: string; to: string; valueWei: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ArcTransferReceipt> {
  const receipt = await verifyArcReceipt(transactionHash, rpcUrl, chainId, fetchImpl);
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

export async function verifyArcGatewaySettlement(
  input: {
    chainId: ArcChainId;
    rpcUrl: string;
    nonce: string;
    transferId: string;
    payer: string;
    merchant: string;
    amountMicrousd: string;
    /** Circle binds this transfer to its nonce and batch; Arc may net several transfers into one depositor delta. */
    allowAggregatedBatch?: boolean;
  },
  options: { gatewayFetch?: typeof fetch; rpcFetch?: typeof fetch } = {},
): Promise<CircleGatewaySettlement> {
  const network = arcNetwork(input.chainId);
  if (!/^0x[0-9a-f]{64}$/i.test(input.nonce)) throw new Error("Circle Gateway authorization nonce is malformed");
  if (!input.transferId || input.transferId.length > 256) throw new Error("Circle Gateway transfer id is invalid");
  if (!/^(0|[1-9][0-9]*)$/.test(input.amountMicrousd) || BigInt(input.amountMicrousd) <= 0n) {
    throw new Error("Circle Gateway payment amount must be positive USDC microunits");
  }
  const payer = address(input.payer);
  const merchant = address(input.merchant);
  const gatewayFetch = options.gatewayFetch ?? fetch;
  const rpcFetch = options.rpcFetch ?? fetch;
  const transferResponse = await gatewayFetch(
    `${network.gatewayApi}/x402/transfers?nonce=${encodeURIComponent(input.nonce)}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
  );
  if (!transferResponse.ok) throw new Error(`Circle Gateway transfer lookup returned ${transferResponse.status}`);
  const transferBody = await transferResponse.json() as { transfers?: unknown };
  if (!Array.isArray(transferBody.transfers) || transferBody.transfers.length > 1) {
    throw new Error("Circle Gateway did not return a unique transfer for the original nonce");
  }
  if (transferBody.transfers.length === 0) return { status: "pending" };
  const transfer = transferBody.transfers[0] as Record<string, unknown>;
  if (
    transfer.id !== input.transferId || String(transfer.nonce).toLowerCase() !== input.nonce.toLowerCase() ||
    address(String(transfer.fromAddress)) !== payer || address(String(transfer.toAddress)) !== merchant ||
    transfer.sendingNetwork !== `eip155:${input.chainId}` || transfer.recipientNetwork !== `eip155:${input.chainId}` ||
    transfer.token !== "USDC" || transfer.amount !== input.amountMicrousd
  ) {
    throw new Error("Circle Gateway transfer differs from the signed Task payment authorization");
  }
  const status = transfer.status;
  if (!["received", "batched", "confirmed", "completed", "failed"].includes(String(status))) {
    throw new Error("Circle Gateway returned an unknown settlement status");
  }
  if (status === "failed") throw new Error("Circle Gateway marked the original payment as failed; preserve its nonce and journal");
  if (status !== "confirmed" && status !== "completed") return { status: "pending", transferId: input.transferId };
  const transactionHash = transfer.txHash;
  if (typeof transactionHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(transactionHash)) {
    throw new Error("Circle Gateway did not provide a valid settlement transaction hash");
  }
  await verifyArcChainId(input.rpcUrl, input.chainId, rpcFetch);
  const [transactionBody, receiptBody] = await Promise.all([
    rpcFetch(input.rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [transactionHash] }),
      signal: AbortSignal.timeout(15_000),
    }).then(async (response) => ({ ok: response.ok, body: await response.json() as Record<string, any> })),
    rpcFetch(input.rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionReceipt", params: [transactionHash] }),
      signal: AbortSignal.timeout(15_000),
    }).then(async (response) => ({ ok: response.ok, body: await response.json() as Record<string, any> })),
  ]);
  const transaction = transactionBody.body.result as Record<string, any> | undefined;
  const receipt = receiptBody.body.result as Record<string, any> | undefined;
  if (!transactionBody.ok || !receiptBody.ok || transactionBody.body.error || receiptBody.body.error || !transaction || !receipt) {
    throw new Error("Circle Gateway settlement is not independently confirmed on Arc");
  }
  const calldata = transaction.input ?? transaction.data;
  const transactionSender = address(String(transaction.from));
  const batchFunction = [parseAbiItem("function submitBatch(bytes calldataBytes, bytes signature)")];
  if (
    String(transaction.hash).toLowerCase() !== transactionHash.toLowerCase() ||
    BigInt(transaction.chainId) !== BigInt(input.chainId) || address(transaction.to) !== address(network.gatewayWallet) ||
    typeof calldata !== "string" || calldata.slice(0, 10).toLowerCase() !== "0xc9486c8b" ||
    receipt.transactionHash?.toLowerCase() !== transactionHash.toLowerCase() || receipt.status !== "0x1"
  ) {
    throw new Error("Circle-reported settlement is not a successful Arc Gateway batch transaction");
  }
  const batchCall = decodeFunctionData({ abi: batchFunction, data: calldata as `0x${string}` });
  if (batchCall.functionName !== "submitBatch") throw new Error("Circle settlement called an unexpected Gateway function");
  const [deltas, batchId, domain, token, gateway] = decodeAbiParameters(
    parseAbiParameters("(address depositor, int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress"),
    batchCall.args[0],
  ) as unknown as [Array<{ depositor: `0x${string}`; value: bigint }>, `0x${string}`, number, `0x${string}`, `0x${string}`];
  if (
    !/^0x(?:[0-9a-f]{2})+$/i.test(batchCall.args[1]) || batchCall.args[1].length < 132 ||
    domain !== network.gatewayDomain || address(token) !== address(network.usdc) || address(gateway) !== address(network.gatewayWallet) ||
    deltas.reduce((sum, delta) => sum + delta.value, 0n) !== 0n
  ) {
    throw new Error("Circle Gateway batch domain, asset, signature, or balance deltas are invalid");
  }
  const payerDeltas = deltas.filter((delta) => address(delta.depositor) === payer);
  const merchantDeltas = deltas.filter((delta) => address(delta.depositor) === merchant);
  const paymentAmount = BigInt(input.amountMicrousd);
  const exactAmount = payerDeltas.length === 1 && payerDeltas[0].value === -paymentAmount &&
    merchantDeltas.length === 1 && merchantDeltas[0].value === paymentAmount;
  const aggregateCoversAmount = input.allowAggregatedBatch && payerDeltas.length === 1 &&
    payerDeltas[0].value <= -paymentAmount && merchantDeltas.length === 1 &&
    merchantDeltas[0].value >= paymentAmount;
  if (!exactAmount && !aggregateCoversAmount) {
    throw new Error("Circle Gateway batch deltas do not cover the verified transfer amount");
  }
  const insufficientBalanceTopic = keccak256(stringToHex("InsufficientBalance(address,address,uint256,uint256,uint256)"));
  const insufficientPayerDebit = (receipt.logs as Record<string, any>[] | undefined)?.some((log) =>
    address(log.address) === address(network.gatewayWallet) && log.topics?.length === 3 &&
    String(log.topics[0]).toLowerCase() === insufficientBalanceTopic.toLowerCase() &&
    address(`0x${String(log.topics[1]).slice(-40)}`) === address(network.usdc) &&
    address(`0x${String(log.topics[2]).slice(-40)}`) === payer);
  if (insufficientPayerDebit) throw new Error("Arc Gateway reported an insufficient USDC balance for the signed payer debit");
  const batchTopic = keccak256(stringToHex("BatchProcessed(bytes32,address,address)"));
  const processed = (receipt.logs as Record<string, any>[] | undefined)?.find((log) =>
    address(log.address) === address(network.gatewayWallet) && log.topics?.length === 4 &&
    String(log.topics[0]).toLowerCase() === batchTopic.toLowerCase() &&
    String(log.topics[1]).toLowerCase() === batchId.toLowerCase() &&
    address(`0x${String(log.topics[3]).slice(-40)}`) === address(network.usdc));
  if (!processed) throw new Error("Arc Gateway receipt has no matching successful BatchProcessed event");
  const batchSigner = `0x${String(processed.topics[2]).slice(-40)}` as `0x${string}`;
  const isBatchSignerCall = encodeFunctionData({
    abi: [parseAbiItem("function isBatchSigner(address signer) view returns (bool)")], args: [batchSigner],
  });
  const signerResponse = await rpcFetch(input.rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: network.gatewayWallet, data: isBatchSignerCall }, receipt.blockNumber] }),
    signal: AbortSignal.timeout(15_000),
  });
  const signerBody = await signerResponse.json() as { result?: string; error?: unknown };
  if (!signerResponse.ok || signerBody.error || typeof signerBody.result !== "string" || BigInt(signerBody.result) !== 1n) {
    throw new Error("Arc Gateway batch signer was not enabled at the settlement block");
  }
  const gasPrice = BigInt(receipt.effectiveGasPrice ?? transaction.gasPrice);
  return {
    status: "confirmed",
    transferId: input.transferId,
    transactionHash: transactionHash.toLowerCase() as `0x${string}`,
    transactionSender,
    blockNumber: BigInt(receipt.blockNumber).toString(),
    gasCostWei: (BigInt(receipt.gasUsed) * gasPrice).toString(),
    batchId,
    ...(!exactAmount ? { amountVerification: "batch_lower_bound" as const } : {}),
  };
}

export async function verifyArcCallReceipt(
  transactionHash: string,
  rpcUrl: string,
  chainId: ArcChainId,
  fetchImpl: typeof fetch = fetch,
): Promise<ArcCallReceipt> {
  return verifyArcReceipt(transactionHash, rpcUrl, chainId, fetchImpl);
}
