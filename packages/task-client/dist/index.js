// src/index.ts
import { createHash as createHash2, createPublicKey, randomUUID, verify } from "node:crypto";
import { lstat as lstat2, open as open2, readFile, rename } from "node:fs/promises";
import path2 from "node:path";
import canonicalize from "canonicalize";

// src/lock.ts
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import fsExt from "fs-ext";
async function withStateLock(directory, name, operation) {
  if (process.platform !== "linux" && process.platform !== "darwin") {
    throw new Error("State locking requires Linux/macOS local POSIX storage");
  }
  await mkdir(directory, { recursive: true, mode: 448 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 63) !== 0) {
    throw new Error("State directory must be private (0700) and not a symlink");
  }
  const file = path.join(directory, name);
  const handle = await open(file, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 384);
  try {
    const owner = await handle.stat();
    if (!owner.isFile() || owner.nlink !== 1 || (owner.mode & 63) !== 0) {
      throw new Error("Lock must be a private regular file with one link; do not delete an ambiguous lock");
    }
    await new Promise((resolve, reject) => {
      fsExt.flock(handle.fd, "exnb", (error) => {
        if (error) reject(new Error("State is locked or locking is unsupported; retain journals and retry after its owner exits", { cause: error }));
        else resolve();
      });
    });
    const current = await lstat(file);
    if (current.dev !== owner.dev || current.ino !== owner.ino || current.isSymbolicLink()) {
      throw new Error("Lock path changed during acquisition; refuse unsafe ownership");
    }
    return await operation();
  } finally {
    await handle.close();
  }
}

// src/index.ts
import { encodeFunctionData as encodeFunctionData2, hashTypedData, keccak256 as keccak2562, parseAbiItem as parseAbiItem2, parseTransaction, recoverTransactionAddress, stringToHex as stringToHex2 } from "viem";

// ../circle-arc-wallet/src/index.ts
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, keccak256, parseAbiItem, parseAbiParameters, stringToHex } from "viem";
var ARC_TESTNET = "ARC-TESTNET";
var ARC_TESTNET_CHAIN_ID = 5042002;
var ARC_MAINNET = "ARC";
var ARC_MAINNET_CHAIN_ID = 5042;
var ARC_NETWORKS = {
  [ARC_TESTNET_CHAIN_ID]: Object.freeze({
    chainId: ARC_TESTNET_CHAIN_ID,
    circleChain: ARC_TESTNET,
    displayName: "Arc Testnet",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
    gatewayApi: "https://gateway-api-testnet.circle.com/v1",
    gatewayDomain: 26
  }),
  [ARC_MAINNET_CHAIN_ID]: Object.freeze({
    chainId: ARC_MAINNET_CHAIN_ID,
    circleChain: ARC_MAINNET,
    displayName: "Arc Mainnet",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee",
    gatewayApi: "https://gateway-api.circle.com/v1",
    gatewayDomain: 26
  })
};
function arcNetwork(chainId) {
  if (chainId !== ARC_TESTNET_CHAIN_ID && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(`Unsupported Arc chain id: ${chainId}`);
  }
  return ARC_NETWORKS[chainId];
}
var EIP712_DOMAIN_FIELDS = [
  ["name", "string"],
  ["version", "string"],
  ["chainId", "uint256"],
  ["verifyingContract", "address"],
  ["salt", "bytes32"]
];
function address(value) {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) throw new Error("Expected a 20-byte EVM address");
  return value.toLowerCase();
}
function amount(value) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) {
    throw new Error("USDC amount must be a non-negative decimal with at most six decimals");
  }
  if (Number(value) <= 0) throw new Error("USDC amount must be positive");
  return value;
}
function nativeAmount(valueWei) {
  if (!/^(0|[1-9][0-9]*)$/.test(valueWei)) throw new Error("Contract value must be decimal wei");
  const wei = BigInt(valueWei);
  const unit = 10n ** 18n;
  const whole = wei / unit;
  const fraction = (wei % unit).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
function circleIdempotencyKey(seed) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(seed)) throw new Error("Use an explicit stable idempotency key");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seed)) return seed.toLowerCase();
  const digest = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(seed).digest("hex");
  const variant = (Number.parseInt(digest[16], 16) & 3 | 8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Circle CLI returned no output");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Circle CLI did not return JSON output");
  }
}
function circleTypedData(typedData) {
  if (!typedData || typeof typedData !== "object" || Array.isArray(typedData)) {
    throw new Error("EIP-712 typed data must be an object");
  }
  const input = typedData;
  const domain = input.domain;
  const types = input.types;
  if (!domain || typeof domain !== "object" || Array.isArray(domain) || !types || typeof types !== "object" || Array.isArray(types)) {
    throw new Error("EIP-712 typed data requires domain and types objects");
  }
  const domainRecord = domain;
  return {
    ...input,
    types: {
      EIP712Domain: EIP712_DOMAIN_FIELDS.filter(([name]) => domainRecord[name] !== void 0).map(([name, type]) => ({ name, type })),
      ...types
    }
  };
}
function readString(record, keys) {
  if (!record || typeof record !== "object") return void 0;
  const value = record;
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  for (const nested of [value.data, value.transaction, value.result]) {
    const found = readString(nested, keys);
    if (found) return found;
  }
  return void 0;
}
function records(value) {
  if (Array.isArray(value)) return value.filter((item) => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value;
  for (const key of ["transactions", "items", "data", "result"]) {
    const nested = records(record[key]);
    if (nested.length) return nested;
  }
  return [record];
}
function normalizeCircleTransferResult(raw) {
  const hash2 = readString(raw, ["transactionHash", "txHash", "tx_hash", "hash"]);
  if (hash2 && !/^0x[0-9a-f]{64}$/i.test(hash2)) throw new Error("Circle returned an invalid transaction hash");
  return {
    transactionId: readString(raw, ["transactionId", "transaction_id", "id"]),
    transactionHash: hash2?.toLowerCase(),
    state: readString(raw, ["state", "status"]),
    raw
  };
}
var runCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => stdout += chunk);
  child.stderr.setEncoding("utf8").on("data", (chunk) => stderr += chunk);
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`Circle CLI exited ${code}: ${stderr.trim() || "unknown error"}`));
  });
});
var CircleArcWallet = class {
  walletAddress;
  command;
  runner;
  transactionSigner;
  constructor(options) {
    this.walletAddress = address(options.walletAddress);
    this.command = options.command ?? "circle";
    this.runner = options.runner ?? runCommand;
    this.transactionSigner = options.transactionSigner;
  }
  async signTransaction(transaction) {
    arcNetwork(transaction.chainId);
    if (!this.transactionSigner) throw new Error("An explicit raw-transaction signer is required for bounded Arc Mainnet execution");
    const reviewed = Object.freeze({ ...transaction });
    const signed = await this.transactionSigner(reviewed);
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(signed)) throw new Error("Transaction signer returned malformed signed bytes");
    return signed.toLowerCase();
  }
  async gatewayPayer(chainId) {
    const network = arcNetwork(chainId);
    const { stdout } = await this.runner(this.command, [
      "gateway",
      "balance",
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain,
      "--output",
      "json"
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
  reviewTransfer(plan) {
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
      "json"
    ];
    return {
      title: `Pay ${plan.invoiceId}`,
      summary: `Send ${amountUsdc} native USDC on ${network.displayName} to ${recipient}`,
      command,
      chainId: plan.chainId,
      walletAddress: this.walletAddress,
      recipient,
      amountUsdc,
      invoiceId: plan.invoiceId
    };
  }
  async transfer(plan, confirm) {
    if (plan.chainId === ARC_MAINNET_CHAIN_ID) throw new Error("Arc Mainnet transfers require the bounded Execution Kit path");
    const review = this.reviewTransfer(plan);
    if (!await confirm(review)) throw new Error("Circle wallet transfer rejected by the reviewer");
    const { stdout } = await this.runner(this.command, review.command);
    return normalizeCircleTransferResult(parseJsonOutput(stdout));
  }
  reviewContractCall(plan) {
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
      "wallet",
      "execute",
      plan.abiFunctionSignature,
      ...plan.abiParameters,
      "--contract",
      to,
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain,
      "--amount",
      executionAmount,
      "--idempotency-key",
      idempotencyKey,
      "--output",
      "json"
    ];
    return {
      title: plan.label,
      summary: `Execute exact ${plan.data.slice(0, 10)} call on ${to} with ${executionAmount} native token (${plan.value} wei)`,
      command,
      chainId: plan.chainId,
      walletAddress: this.walletAddress,
      to,
      data: plan.data.toLowerCase(),
      value: plan.value
    };
  }
  async executeContractCall(plan, confirm) {
    const review = this.reviewContractCall(plan);
    if (!await confirm(review)) throw new Error("Circle contract execution rejected by the reviewer");
    const { stdout } = await this.runner(this.command, review.command);
    return normalizeCircleTransferResult(parseJsonOutput(stdout));
  }
  async transaction(transactionId, chainId, operation) {
    const network = arcNetwork(chainId);
    const args = [
      "transaction",
      "list",
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain
    ];
    if (operation) args.push("--operation", operation);
    args.push("--output", "json");
    const { stdout } = await this.runner(this.command, [
      ...args
    ]);
    const found = records(parseJsonOutput(stdout)).find((item) => readString(item, ["transactionId", "transaction_id", "id"]) === transactionId);
    return found ? normalizeCircleTransferResult(found) : void 0;
  }
  async waitForConfirmation(transactionId, chainId, options = {}) {
    const timeoutMs = options.timeoutMs ?? 12e4;
    const pollIntervalMs = options.pollIntervalMs ?? 2e3;
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
  async signTypedData(typedData, confirm) {
    const normalizedTypedData = circleTypedData(typedData);
    const domain = typedData?.domain;
    const chainId = typeof domain?.chainId === "bigint" || typeof domain?.chainId === "number" || typeof domain?.chainId === "string" ? Number(domain.chainId) : NaN;
    const network = arcNetwork(chainId);
    const primaryType = typedData?.primaryType;
    const title = primaryType === "TaskAuthorization" ? "Authorize this exact Aomi Task request" : primaryType === "TransferWithAuthorization" ? "Authorize the Aomi Task service payment" : "Authorize typed data";
    if (!await confirm({ title, typedData, walletAddress: this.walletAddress })) {
      throw new Error("Circle wallet signature rejected by the reviewer");
    }
    const { stdout } = await this.runner(this.command, [
      "wallet",
      "sign",
      "typed-data",
      JSON.stringify(normalizedTypedData, (_, value) => typeof value === "bigint" ? value.toString() : value),
      "--address",
      this.walletAddress,
      "--chain",
      network.circleChain,
      "--quiet"
    ]);
    const signature = stdout.trim();
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(signature) || signature.length < 132 || signature.length > 32770) throw new Error("Circle returned an invalid EIP-712 signature");
    return signature.toLowerCase();
  }
};
async function verifyArcReceipt(transactionHash, rpcUrl, chainId, fetchImpl = fetch) {
  if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error("Invalid Arc transaction hash");
  await verifyArcChainId(rpcUrl, chainId, fetchImpl);
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [transactionHash] }),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json();
  if (body.error || !body.result) throw new Error("Arc receipt is not confirmed yet");
  const hash2 = readString(body.result, ["transactionHash"]);
  const blockNumber = readString(body.result, ["blockNumber"]);
  const status = readString(body.result, ["status"]);
  if (hash2?.toLowerCase() !== transactionHash.toLowerCase() || !/^0x[0-9a-f]+$/i.test(blockNumber ?? "") || status !== "0x1") {
    throw new Error("Arc receipt did not prove a successful transaction");
  }
  const rawLogs = body.result.logs;
  if (rawLogs !== void 0 && (!Array.isArray(rawLogs) || !rawLogs.every((log) => Boolean(log) && typeof log === "object" && !Array.isArray(log)))) {
    throw new Error("Arc receipt contains malformed logs");
  }
  return {
    transactionHash: hash2.toLowerCase(),
    blockNumber,
    status: "0x1",
    logs: rawLogs ?? []
  };
}
async function verifyArcChainId(rpcUrl, chainId, fetchImpl = fetch) {
  arcNetwork(chainId);
  if (!rpcUrl.startsWith("https://") && !rpcUrl.startsWith("http://127.0.0.1:") && !rpcUrl.startsWith("http://localhost:")) {
    throw new Error("Arc RPC must use HTTPS (loopback HTTP is allowed)");
  }
  const chainResponse = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(15e3)
  });
  if (!chainResponse.ok) throw new Error(`Arc RPC returned ${chainResponse.status}`);
  const chainBody = await chainResponse.json();
  if (chainBody.error || typeof chainBody.result !== "string" || BigInt(chainBody.result) !== BigInt(chainId)) {
    throw new Error(`Arc RPC chain id does not match the selected chain ${chainId}`);
  }
}
async function verifyArcTransferReceipt(transactionHash, rpcUrl, chainId, expected, fetchImpl = fetch) {
  const receipt = await verifyArcReceipt(transactionHash, rpcUrl, chainId, fetchImpl);
  const from = address(expected.from);
  const to = address(expected.to);
  if (!/^(0|[1-9][0-9]*)$/.test(expected.valueWei)) throw new Error("Expected transfer value must be decimal wei");
  const value = `0x${BigInt(expected.valueWei).toString(16)}`;
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [transactionHash] }),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json();
  if (body.error || !body.result) throw new Error("Arc transaction is not available");
  const actualHash = readString(body.result, ["hash"]);
  const actualFrom = readString(body.result, ["from"]);
  const actualTo = readString(body.result, ["to"]);
  const actualValue = readString(body.result, ["value"]);
  const input = readString(body.result, ["input"]);
  if (actualHash?.toLowerCase() !== receipt.transactionHash || actualFrom?.toLowerCase() !== from || actualTo?.toLowerCase() !== to || actualValue?.toLowerCase() !== value || input !== "0x") {
    throw new Error("Arc transaction does not match the reviewed native transfer");
  }
  return { ...receipt, from, to, value, input: "0x" };
}
async function verifyArcGatewaySettlement(input, options = {}) {
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
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(2e4) }
  );
  if (!transferResponse.ok) throw new Error(`Circle Gateway transfer lookup returned ${transferResponse.status}`);
  const transferBody = await transferResponse.json();
  if (!Array.isArray(transferBody.transfers) || transferBody.transfers.length > 1) {
    throw new Error("Circle Gateway did not return a unique transfer for the original nonce");
  }
  if (transferBody.transfers.length === 0) return { status: "pending" };
  const transfer = transferBody.transfers[0];
  if (transfer.id !== input.transferId || String(transfer.nonce).toLowerCase() !== input.nonce.toLowerCase() || address(String(transfer.fromAddress)) !== payer || address(String(transfer.toAddress)) !== merchant || transfer.sendingNetwork !== `eip155:${input.chainId}` || transfer.recipientNetwork !== `eip155:${input.chainId}` || transfer.token !== "USDC" || transfer.amount !== input.amountMicrousd) {
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
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [transactionHash] }),
      signal: AbortSignal.timeout(15e3)
    }).then(async (response) => ({ ok: response.ok, body: await response.json() })),
    rpcFetch(input.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionReceipt", params: [transactionHash] }),
      signal: AbortSignal.timeout(15e3)
    }).then(async (response) => ({ ok: response.ok, body: await response.json() }))
  ]);
  const transaction = transactionBody.body.result;
  const receipt = receiptBody.body.result;
  if (!transactionBody.ok || !receiptBody.ok || transactionBody.body.error || receiptBody.body.error || !transaction || !receipt) {
    throw new Error("Circle Gateway settlement is not independently confirmed on Arc");
  }
  const calldata = transaction.input ?? transaction.data;
  const transactionSender = address(String(transaction.from));
  const batchFunction = [parseAbiItem("function submitBatch(bytes calldataBytes, bytes signature)")];
  if (String(transaction.hash).toLowerCase() !== transactionHash.toLowerCase() || BigInt(transaction.chainId) !== BigInt(input.chainId) || address(transaction.to) !== address(network.gatewayWallet) || typeof calldata !== "string" || calldata.slice(0, 10).toLowerCase() !== "0xc9486c8b" || receipt.transactionHash?.toLowerCase() !== transactionHash.toLowerCase() || receipt.status !== "0x1") {
    throw new Error("Circle-reported settlement is not a successful Arc Gateway batch transaction");
  }
  const batchCall = decodeFunctionData({ abi: batchFunction, data: calldata });
  if (batchCall.functionName !== "submitBatch") throw new Error("Circle settlement called an unexpected Gateway function");
  const [deltas, batchId, domain, token, gateway] = decodeAbiParameters(
    parseAbiParameters("(address depositor, int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress"),
    batchCall.args[0]
  );
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(batchCall.args[1]) || batchCall.args[1].length < 132 || domain !== network.gatewayDomain || address(token) !== address(network.usdc) || address(gateway) !== address(network.gatewayWallet) || deltas.reduce((sum, delta) => sum + delta.value, 0n) !== 0n) {
    throw new Error("Circle Gateway batch domain, asset, signature, or balance deltas are invalid");
  }
  const payerDeltas = deltas.filter((delta) => address(delta.depositor) === payer);
  const merchantDeltas = deltas.filter((delta) => address(delta.depositor) === merchant);
  const paymentAmount = BigInt(input.amountMicrousd);
  if (payerDeltas.length !== 1 || payerDeltas[0].value !== -paymentAmount || merchantDeltas.length !== 1 || merchantDeltas[0].value !== paymentAmount) {
    throw new Error("Circle Gateway batch does not debit the payer and credit the exact merchant amount once");
  }
  const insufficientBalanceTopic = keccak256(stringToHex("InsufficientBalance(address,address,uint256,uint256,uint256)"));
  const insufficientPayerDebit = receipt.logs?.some((log) => address(log.address) === address(network.gatewayWallet) && log.topics?.length === 3 && String(log.topics[0]).toLowerCase() === insufficientBalanceTopic.toLowerCase() && address(`0x${String(log.topics[1]).slice(-40)}`) === address(network.usdc) && address(`0x${String(log.topics[2]).slice(-40)}`) === payer);
  if (insufficientPayerDebit) throw new Error("Arc Gateway reported an insufficient USDC balance for the signed payer debit");
  const batchTopic = keccak256(stringToHex("BatchProcessed(bytes32,address,address)"));
  const processed = receipt.logs?.find((log) => address(log.address) === address(network.gatewayWallet) && log.topics?.length === 4 && String(log.topics[0]).toLowerCase() === batchTopic.toLowerCase() && String(log.topics[1]).toLowerCase() === batchId.toLowerCase() && address(`0x${String(log.topics[3]).slice(-40)}`) === address(network.usdc));
  if (!processed) throw new Error("Arc Gateway receipt has no matching successful BatchProcessed event");
  const batchSigner = `0x${String(processed.topics[2]).slice(-40)}`;
  const isBatchSignerCall = encodeFunctionData({
    abi: [parseAbiItem("function isBatchSigner(address signer) view returns (bool)")],
    args: [batchSigner]
  });
  const signerResponse = await rpcFetch(input.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: network.gatewayWallet, data: isBatchSignerCall }, receipt.blockNumber] }),
    signal: AbortSignal.timeout(15e3)
  });
  const signerBody = await signerResponse.json();
  if (!signerResponse.ok || signerBody.error || typeof signerBody.result !== "string" || BigInt(signerBody.result) !== 1n) {
    throw new Error("Arc Gateway batch signer was not enabled at the settlement block");
  }
  const gasPrice = BigInt(receipt.effectiveGasPrice ?? transaction.gasPrice);
  return {
    status: "confirmed",
    transferId: input.transferId,
    transactionHash: transactionHash.toLowerCase(),
    transactionSender,
    blockNumber: BigInt(receipt.blockNumber).toString(),
    gasCostWei: (BigInt(receipt.gasUsed) * gasPrice).toString(),
    batchId
  };
}

// src/index.ts
var TASK_RESOURCE = "https://chat.aomi.dev/v1/task";
var TASK_ENDPOINT = "/v1/task/build";
var arcExecutionKitCapability = Symbol("ArcExecutionKit capability");
var taskExecutionCheckpoint = Symbol("TaskClient execution checkpoint");
var initializeTaskExecutionLedger = Symbol("TaskClient execution ledger initialization");
var markTaskGatewayFundingReady = Symbol("TaskClient Gateway funding verification");
var hash = (data) => createHash2("sha256").update(data).digest("hex");
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function address2(value) {
  requireThat(typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value), "Invalid address");
  return value.toLowerCase();
}
function decimal(value) {
  requireThat(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), "Expected unsigned decimal string");
  return BigInt(value);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function immutableSnapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableSnapshot));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableSnapshot(item)]));
    return Object.freeze(copy);
  }
  return value;
}
function normalized(request, idempotencyKey) {
  const source = request.constraints ?? {};
  const constraints = request.constraints == null ? null : {
    maxOutgoingUsdcWei: null,
    maxGasUnits: null,
    ...source,
    allowedTargets: (source.allowedTargets ?? []).map(address2),
    minimumReceived: (source.minimumReceived ?? []).map((entry) => ({
      ...entry,
      asset: entry.asset === "native" ? "native" : address2(entry.asset)
    }))
  };
  return {
    executionKind: request.executionKind ?? "eoa_transactions",
    transactionSafetyMode: request.transactionSafetyMode ?? null,
    intent: request.intent,
    chainId: String(request.chainId),
    sender: address2(request.sender),
    payer: address2(request.payer ?? request.sender),
    calls: (request.calls ?? []).map((call) => ({
      to: address2(call.to),
      data: call.data.toLowerCase(),
      value: decimal(call.value).toString()
    })),
    constraints: constraints == null ? null : {
      ...constraints,
      maxGasUnits: constraints.maxGasUnits == null ? null : String(constraints.maxGasUnits)
    },
    ...idempotencyKey === void 0 ? {} : { idempotencyKey }
  };
}
var TASK_TYPES = {
  TaskAuthorization: [
    { name: "endpoint", type: "string" },
    { name: "requestHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "sender", type: "address" },
    { name: "payer", type: "address" },
    { name: "idempotencyKey", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" }
  ]
};
function taskAuthorizationData(request, idempotencyKey, issuedAt, expiresAt = issuedAt + 300) {
  arcNetwork(request.chainId);
  requireThat(Number.isSafeInteger(issuedAt) && Number.isSafeInteger(expiresAt) && expiresAt > issuedAt && expiresAt - issuedAt <= 300, "Task authorization must live for at most five minutes");
  const canonical = canonicalize(normalized(request, idempotencyKey));
  requireThat(canonical, "Task request is not canonicalizable");
  const requestHash = keccak2562(stringToHex2(canonical));
  const sender = address2(request.sender);
  const payer = address2(request.payer ?? request.sender);
  const typedData = {
    domain: {
      name: "Aomi Task API",
      version: "1",
      chainId: request.chainId,
      salt: keccak2562(stringToHex2(TASK_RESOURCE))
    },
    types: TASK_TYPES,
    primaryType: "TaskAuthorization",
    message: {
      endpoint: TASK_ENDPOINT,
      requestHash,
      chainId: BigInt(request.chainId),
      sender,
      payer,
      idempotencyKey,
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt)
    }
  };
  return { canonical, requestHash, digest: hashTypedData(typedData), typedData };
}
async function fetchTrustedTaskJwks(taskEndpoint, requestFetch = fetch) {
  let endpoint;
  try {
    endpoint = new URL(taskEndpoint);
  } catch {
    throw new Error("Task endpoint must be an absolute HTTPS URL");
  }
  requireThat(
    endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
    "Trusted Task JWKS requires a clean HTTPS endpoint"
  );
  const response = await requestFetch(new URL("/.well-known/jwks.json", endpoint.origin), {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "omit",
    redirect: "error"
  });
  requireThat(response.status === 200, `Trusted Task JWKS request failed with HTTP ${response.status}`);
  const document = await response.json();
  requireThat(
    typeof document === "object" && document !== null && !Array.isArray(document) && Array.isArray(document.keys) && document.keys.length > 0,
    "Invalid Task JWKS document"
  );
  const keys = document.keys.map((value) => {
    requireThat(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid Task JWKS key");
    const key = value;
    requireThat(
      Object.keys(key).every((field) => ["kty", "crv", "use", "key_ops", "alg", "kid", "x"].includes(field)) && key.kty === "OKP" && key.crv === "Ed25519" && key.use === "sig" && key.alg === "EdDSA" && Array.isArray(key.key_ops) && key.key_ops.length === 1 && key.key_ops[0] === "verify" && typeof key.kid === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(key.kid) && typeof key.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(key.x) && Buffer.from(key.x, "base64url").length === 32 && Buffer.from(key.x, "base64url").toString("base64url") === key.x,
      "Invalid or non-public Ed25519 Task JWKS key"
    );
    return key;
  });
  requireThat(new Set(keys.map((key) => key.kid)).size === keys.length, "Duplicate Task JWKS key id");
  return { keys };
}
function walletPrincipal(request) {
  return `wallet:eip155:${request.chainId}:${address2(request.sender)}`;
}
function verifyAttestation(jwt, jwks, subject, now) {
  const parts = jwt.split(".");
  requireThat(parts.length === 3, "Invalid attestation");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  requireThat(
    header.alg === "EdDSA" && typeof header.kid === "string" && !header.jku && !header.jwk && !header.x5u && !header.crit,
    "Unsupported attestation header"
  );
  const keys = jwks.keys.filter((key) => key.kid === header.kid && key.kty === "OKP" && key.crv === "Ed25519" && (!key.alg || key.alg === "EdDSA") && (!key.use || key.use === "sig"));
  requireThat(keys.length === 1, "No unique explicitly trusted signing key");
  requireThat(
    verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: keys[0], format: "jwk" }),
      Buffer.from(parts[2], "base64url")
    ),
    "Invalid attestation signature"
  );
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  requireThat(
    claims.aud === "aomi-task-artifact" && claims.sub === subject && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp) && Number(claims.iat) <= now + 30 && Number(claims.exp) > now && Number(claims.exp) > Number(claims.iat),
    "Invalid attestation identity or lifetime"
  );
  return claims;
}
function validateQuote(quote, requiredHeader, request, options, now) {
  const network = arcNetwork(request.chainId);
  const claims = verifyAttestation(quote.attestation, options.trustedJwks, walletPrincipal(request), now);
  requireThat(typeof claims.request?.idempotencyKey === "string", "Signed request has no idempotency key");
  const canonical = canonicalize(normalized(request, claims.request.idempotencyKey));
  requireThat(canonical, "Task request is not canonicalizable");
  const requestHash = keccak2562(stringToHex2(canonical)).slice(2);
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
  requireThat(address2(accepted.asset) === network.usdc && address2(accepted.payTo) === address2(options.recipient), "Unexpected asset or recipient");
  requireThat(address2(request.payer ?? request.sender) === address2(options.payer) && address2(claims.payer) === address2(options.payer) && Number(claims.chainId) === request.chainId, "Wrong payer or chain");
  requireThat(fee > 0n && fee <= options.maxFeeMicrousd && (typeof claims.amountMicrousd === "string" || Number.isSafeInteger(claims.amountMicrousd)) && BigInt(claims.amountMicrousd) === fee && decimal(quote.pricing?.fee_microusd) === fee, "Fee exceeds limit or differs from signed quote");
  requireThat(typeof accepted.extra?.aomiTaskNonce === "string" && /^0x[0-9a-f]{64}$/.test(accepted.extra.aomiTaskNonce) && accepted.extra.aomiTaskNonce !== `0x${"0".repeat(64)}`, "Missing or invalid quote-bound authorization nonce");
  requireThat(accepted.extra?.name === "GatewayWalletBatched" && accepted.extra?.version === "1" && address2(accepted.extra?.verifyingContract) === network.gatewayWallet, "Unexpected EIP712 domain");
  requireThat(Number.isSafeInteger(accepted.extra.minValiditySeconds) && accepted.extra.minValiditySeconds > 0 && accepted.extra.minValiditySeconds <= 691140 && Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 && accepted.maxTimeoutSeconds <= 300, "Unsupported authorization lifetime");
  return { required, accepted };
}
function validateStoredQuote(quote, requiredHeader, request, options) {
  let issuedAt;
  try {
    const claims = JSON.parse(Buffer.from(String(quote?.attestation).split(".")[1] ?? "", "base64url").toString());
    issuedAt = claims.iat;
  } catch {
    throw new Error("Stored Task quote has no valid signed issue time");
  }
  requireThat(Number.isSafeInteger(issuedAt), "Stored Task quote has no valid signed issue time");
  const validation = validateQuote(quote, requiredHeader, request, options, Number(issuedAt));
  return { ...validation, issuedAt: Number(issuedAt) };
}
var TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};
var TaskClient = class {
  #options;
  get options() {
    return this.#options;
  }
  constructor(options) {
    const url = new URL(options.endpoint);
    requireThat(
      url.pathname === "/v1/task/build" && !url.search && !url.username && !url.password && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
      "Use explicit HTTPS Task API endpoint (loopback HTTP allowed)"
    );
    requireThat(options.maxFeeMicrousd > 0n, "Set an explicit positive fee cap");
    this.#options = immutableSnapshot(options);
    Object.freeze(this);
  }
  now() {
    return this.options.now?.() ?? Math.floor(Date.now() / 1e3);
  }
  async save(state) {
    await this.writePrivateJson("state.json", state);
  }
  async writePrivateJson(name, state) {
    const file = path2.join(this.options.stateDirectory, name);
    const temporary = `${file}.${randomUUID()}`;
    const handle = await open2(temporary, "wx", 384);
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    const directory = await open2(this.options.stateDirectory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async readPrivateJson(name) {
    const file = path2.join(this.options.stateDirectory, name);
    const info = await lstat2(file);
    requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 63) === 0, `Task ${name} must be a private regular journal`);
    return JSON.parse(await readFile(file, "utf8"));
  }
  async [initializeTaskExecutionLedger](artifactHash, servicePurchaseReceipt) {
    return this.withLock(async () => {
      const state = await this.readPrivateJson("state.json");
      requireThat(
        state.phase === "complete" && state.quote?.payloadHash === artifactHash && typeof state.bytes === "string" && hash(Buffer.from(state.bytes, "base64")) === artifactHash && stable(state.receipt) === stable(servicePurchaseReceipt),
        "Execution ledger is not bound to the verified purchased artifact and receipt"
      );
      let ledger;
      try {
        ledger = await this.readPrivateJson("execution.json");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (ledger) {
        requireThat(
          ledger.version === 1 && ledger.artifactHash === artifactHash && stable(ledger.servicePurchaseReceipt) === stable(servicePurchaseReceipt),
          "Existing execution ledger belongs to a different Task artifact or purchase"
        );
      } else {
        requireThat(state.executionLedgerInitialized !== true, "Execution ledger is missing after initialization; reconcile the original transaction before recovery");
        ledger = {
          version: 1,
          artifactHash,
          servicePurchaseReceipt: immutableSnapshot(servicePurchaseReceipt),
          executionEverStarted: false
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
  async [markTaskGatewayFundingReady](quoteId, feeMicrousd, fundingJournalHash) {
    return this.withLock(async () => {
      requireThat(/^[0-9a-f]{64}$/.test(fundingJournalHash), "Gateway funding journal hash is malformed");
      const state = await this.readPrivateJson("state.json");
      requireThat(
        ["quoted", "signing", "pending", "settlement_pending", "complete"].includes(state.phase) && state.quote?.quoteId === quoteId && state.quote?.payloadHash && state.quote?.pricing?.fee_microusd === feeMicrousd && address2(state.policy?.payer) === address2(this.options.payer),
        "Verified Gateway funding does not match the active Task quote and payer"
      );
      if (state.gatewayFunding) {
        requireThat(
          state.gatewayFunding.quoteId === quoteId && state.gatewayFunding.feeMicrousd === feeMicrousd && state.gatewayFunding.journalHash === fundingJournalHash,
          "Existing Task purchase is bound to a different Gateway funding journal"
        );
      } else {
        requireThat(state.phase === "quoted", "Gateway funding cannot be attached after a Mainnet payment attempt has started");
        state.gatewayFunding = { quoteId, feeMicrousd, journalHash: fundingJournalHash };
        await this.save(state);
      }
      return true;
    });
  }
  async [taskExecutionCheckpoint](artifactHash, checkpoint) {
    return this.withLock(async () => {
      const purchase = await this.readPrivateJson("state.json");
      requireThat(
        purchase.phase === "complete" && purchase.quote?.payloadHash === artifactHash && typeof purchase.bytes === "string" && hash(Buffer.from(purchase.bytes, "base64")) === artifactHash && purchase.executionLedgerInitialized === true,
        "Task execution checkpoint is not bound to the verified purchased artifact"
      );
      let ledger;
      try {
        ledger = await this.readPrivateJson("execution.json");
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error("Execution ledger is missing after initialization; reconcile the original transaction before recovery");
        }
        throw error;
      }
      requireThat(
        ledger.version === 1 && ledger.artifactHash === artifactHash && stable(ledger.servicePurchaseReceipt) === stable(purchase.receipt),
        "Task execution ledger differs from the verified purchase"
      );
      const previous = ledger.executionJournal;
      const started = ledger.executionEverStarted === true;
      if (checkpoint) {
        requireThat(checkpoint.artifactHash === artifactHash, "Execution checkpoint belongs to a different Task artifact");
        const mainnetExecution = checkpoint.plan?.chainId === ARC_MAINNET_CHAIN_ID;
        if (previous) {
          requireThat(checkpoint.idempotencyKey === previous.idempotencyKey, "Execution checkpoint cannot change its original idempotency key");
          const phaseOrder = ["prepared", "submission_pending", "circle_submitted", "circle_confirmed", "complete"];
          const nextPhase = phaseOrder.indexOf(String(checkpoint.phase));
          const previousPhase = phaseOrder.indexOf(String(previous.phase));
          requireThat(nextPhase >= 0 && previousPhase >= 0 && nextPhase >= previousPhase, "Execution checkpoint cannot move to an unknown or earlier phase");
          requireThat(
            stable(checkpoint.artifactRecovery ?? null) === stable(previous.artifactRecovery ?? null),
            "Execution checkpoint cannot remove or change its original artifact recovery evidence"
          );
          if (previous.mainnetRevalidation && (previous.phase !== "prepared" || nextPhase > previousPhase)) {
            requireThat(
              stable(checkpoint.mainnetRevalidation) === stable(previous.mainnetRevalidation),
              "Execution checkpoint cannot remove or change Mainnet revalidation after submission begins"
            );
          }
          if (mainnetExecution) {
            requireThat(
              nextPhase === 0 || Boolean(checkpoint.mainnetRevalidation),
              "Mainnet revalidation evidence is required before transaction submission"
            );
          }
          const oldRaw = previous.circle?.raw?.rawTransaction;
          const nextRaw = checkpoint.circle?.raw?.rawTransaction;
          if (oldRaw) requireThat(nextRaw === oldRaw, "Execution checkpoint cannot replace the original signed transaction");
          const oldNonce = previous.circle?.raw?.nonce;
          const nextNonce = checkpoint.circle?.raw?.nonce;
          if (oldNonce !== void 0) requireThat(nextNonce === oldNonce, "Execution checkpoint cannot change the original transaction nonce");
        } else {
          requireThat(!started, "Execution checkpoint was removed after execution started; reconcile the original transaction before recovery");
          if (mainnetExecution) {
            requireThat(
              checkpoint.phase === "prepared" || Boolean(checkpoint.mainnetRevalidation),
              "Mainnet revalidation evidence is required before transaction submission"
            );
          }
        }
        ledger.executionEverStarted = true;
        ledger.executionJournal = immutableSnapshot(checkpoint);
        await this.writePrivateJson("execution.json", ledger);
        return { started: true, state: ledger.executionJournal };
      }
      requireThat(!started || previous, "Execution journal is missing after execution started; reconcile the original transaction before recovery");
      return { started, state: previous };
    });
  }
  async post(body, payment) {
    const headers = {
      "content-type": "application/json"
    };
    if (payment) headers["payment-signature"] = payment;
    const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(payment ? 3e4 : 1e5)
    });
    const reader = response.body?.getReader();
    const chunks = [];
    let count = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Response too large; keep pending authorization");
        }
        chunks.push(value);
      }
    }
    return { response, bytes: Buffer.concat(chunks) };
  }
  async withLock(operation) {
    return withStateLock(this.options.stateDirectory, "lock", operation);
  }
  policy(request) {
    return {
      endpoint: this.options.endpoint,
      payer: address2(this.options.payer),
      recipient: address2(this.options.recipient),
      maxFee: this.options.maxFeeMicrousd.toString(),
      request: normalized(request)
    };
  }
  async load(request) {
    const policy = this.policy(request);
    let state;
    try {
      const file = path2.join(this.options.stateDirectory, "state.json");
      const info = await lstat2(file);
      requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 63) === 0, "Journal must be private regular file");
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = { policy, idempotencyKey: this.options.idempotencyKey?.() ?? randomUUID(), phase: "prepare" };
      await this.save(state);
    }
    requireThat(stable(state.policy) === stable(policy), "Existing purchase differs; retain journal and reconcile it before any new purchase");
    let fundingJournal;
    try {
      fundingJournal = await this.readPrivateJson("gateway-funding.json");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (state.gatewayFunding) {
      requireThat(fundingJournal, "Gateway funding journal is missing after approval; preserve the Task nonce and reconcile before recovery");
    }
    if (fundingJournal) {
      const review = fundingJournal.review;
      requireThat(
        fundingJournal.version === 1 && Boolean(review?.taskQuote) && fundingJournal.approvalHash === hash(stable(review)) && review?.chainId === ARC_MAINNET_CHAIN_ID && state.quote?.quoteId === review.taskQuote.quoteId && state.quote?.payloadHash === review.taskQuote.payloadHash && state.quote?.requestHash === review.taskQuote.requestHash && state.quote?.pricing?.fee_microusd === review.feeMicrousd && ["quoted", "signing", "pending", "settlement_pending", "complete"].includes(state.phase),
        "Task purchase journal was rolled back or changed after Mainnet Gateway funding approval"
      );
      if (state.gatewayFunding) {
        requireThat(
          state.gatewayFunding.quoteId === review.taskQuote.quoteId && state.gatewayFunding.feeMicrousd === review.feeMicrousd && state.gatewayFunding.journalHash === fundingJournal.approvalHash,
          "Task purchase does not match its Gateway funding approval"
        );
      }
    }
    let executionLedger;
    try {
      executionLedger = await this.readPrivateJson("execution.json");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (state.executionLedgerInitialized === true) {
      requireThat(executionLedger, "Execution ledger is missing after initialization; reconcile the original transaction before recovery");
    }
    if (executionLedger) {
      requireThat(
        state.phase === "complete" && state.quote?.payloadHash === executionLedger.artifactHash && typeof state.bytes === "string" && hash(Buffer.from(state.bytes, "base64")) === executionLedger.artifactHash && stable(state.receipt) === stable(executionLedger.servicePurchaseReceipt),
        "Task purchase journal was rolled back after execution was initialized; reconcile the original artifact before recovery"
      );
    }
    return state;
  }
  async prepared(request) {
    let state = await this.load(request);
    if (!state.quote && (!state.taskAuthorization || state.taskAuthorization.expiresAt <= this.now() + 30)) {
      const issuedAt = this.now();
      const authorization = taskAuthorizationData(request, state.idempotencyKey, issuedAt);
      requireThat(!state.requestHash || state.requestHash === authorization.requestHash.slice(2), "Refreshed Task authorization changed the request hash");
      const signature = await this.options.signTypedData(authorization.typedData);
      requireThat(/^0x(?:[0-9a-f]{2})+$/i.test(signature) && signature.length >= 132 && signature.length <= 32770, "Invalid Task authorization signature");
      state.taskAuthorization = {
        issuedAt,
        expiresAt: issuedAt + 300,
        signature: signature.toLowerCase()
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
        authorization: state.taskAuthorization
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
    if (state.paymentSignature) validateStoredQuote(state.quote, state.requiredHeader, request, this.options);
    else validateQuote(state.quote, state.requiredHeader, request, this.options, this.now());
    return state;
  }
  async prepare(request) {
    return this.withLock(async () => {
      const state = await this.prepared(request);
      return {
        quoteId: state.quote.quoteId,
        requestHash: state.quote.requestHash,
        payloadHash: state.quote.payloadHash,
        summary: state.quote.summary,
        pricing: state.quote.pricing,
        expiresAt: state.quote.expiresAt
      };
    });
  }
  async purchase(request) {
    return this.withLock(() => this.locked(request));
  }
  async locked(request) {
    let state = await this.prepared(request);
    const { required, accepted } = state.paymentSignature ? validateStoredQuote(state.quote, state.requiredHeader, request, this.options) : validateQuote(state.quote, state.requiredHeader, request, this.options, this.now());
    if (request.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(this.options.rpcUrl, "Arc Mainnet purchase requires an independent Circle settlement RPC verifier");
      await verifyArcChainId(this.options.rpcUrl, ARC_MAINNET_CHAIN_ID, this.options.rpcFetch);
      requireThat(
        state.gatewayFunding?.quoteId === state.quote.quoteId && state.gatewayFunding.feeMicrousd === accepted.amount && /^[0-9a-f]{64}$/.test(state.gatewayFunding.journalHash),
        "Arc Mainnet purchase requires approved, verified Gateway funding through the Execution Kit"
      );
    }
    if (state.phase === "complete") {
      const bytes2 = Buffer.from(state.bytes, "base64");
      requireThat(hash(bytes2) === state.quote.payloadHash, "Stored artifact hash mismatch");
      if (request.chainId === ARC_MAINNET_CHAIN_ID) return this.confirmMainnetSettlement(request, state, accepted);
      return { status: "complete", bytes: bytes2, receipt: state.receipt, settlement: state.settlement };
    }
    if (state.phase === "settlement_pending") {
      return this.confirmMainnetSettlement(request, state, accepted);
    }
    if (!state.authorization) {
      const now = this.now();
      state.authorization = {
        from: address2(this.options.payer),
        to: address2(this.options.recipient),
        value: accepted.amount,
        validAfter: String(Math.max(0, now - 60)),
        validBefore: String(Math.min(now + 691200, state.quote.expiresAt + accepted.extra.minValiditySeconds + 60)),
        nonce: accepted.extra.aomiTaskNonce
      };
      state.phase = "signing";
      await this.save(state);
    }
    if (!state.paymentSignature && decimal(state.authorization.validBefore) < BigInt(this.now() + accepted.extra.minValiditySeconds)) {
      const now = this.now();
      state.authorization.validAfter = String(Math.max(0, now - 60));
      state.authorization.validBefore = String(Math.min(now + 691200, state.quote.expiresAt + accepted.extra.minValiditySeconds + 60));
      await this.save(state);
    }
    const authorization = state.authorization;
    requireThat(address2(authorization.from) === address2(this.options.payer) && address2(authorization.to) === address2(this.options.recipient) && authorization.value === accepted.amount && authorization.nonce === accepted.extra.aomiTaskNonce && BigInt(authorization.validBefore) > BigInt(authorization.validAfter), "Stored authorization mismatch");
    if (!state.paymentSignature) {
      const now = this.now();
      requireThat(decimal(authorization.validAfter) <= BigInt(now) && decimal(authorization.validBefore) >= BigInt(now + accepted.extra.minValiditySeconds) && decimal(authorization.validBefore) <= BigInt(now + 691200), "Authorization expired; do not substitute a new nonce");
      const signature = await this.options.signTypedData({
        domain: { name: "GatewayWalletBatched", version: "1", chainId: request.chainId, verifyingContract: arcNetwork(request.chainId).gatewayWallet },
        types: TYPES,
        primaryType: "TransferWithAuthorization",
        message: {
          ...authorization,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore)
        }
      });
      requireThat(/^0x[0-9a-f]+$/i.test(signature) && signature.length >= 132 && signature.length <= 32770, "Invalid wallet signature");
      state.paymentSignature = Buffer.from(JSON.stringify({
        x402Version: 2,
        accepted,
        resource: required.resource,
        payload: { signature, authorization }
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
        authorization: state.taskAuthorization
      },
      state.paymentSignature
    );
    if (response.status !== 200) return { status: "pending" };
    requireThat(hash(bytes) === state.quote.payloadHash, "Paid response bytes do not match attestation; preserve pending payment");
    const receiptHeader = response.headers.get("payment-response");
    requireThat(receiptHeader, "Missing payment receipt; preserve pending payment");
    const receipt = JSON.parse(Buffer.from(receiptHeader, "base64").toString());
    requireThat(receipt.success === true && receipt.network === `eip155:${request.chainId}` && address2(receipt.payer) === address2(this.options.payer) && typeof receipt.transaction === "string" && receipt.transaction.length > 0, "Payment receipt mismatch");
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
  async confirmMainnetSettlement(request, state, accepted) {
    requireThat(request.chainId === ARC_MAINNET_CHAIN_ID && this.options.rpcUrl, "Mainnet settlement recovery requires the original Arc RPC");
    requireThat(typeof state.bytes === "string" && hash(Buffer.from(state.bytes, "base64")) === state.quote?.payloadHash, "Mainnet artifact bytes are missing or changed before settlement recovery");
    const settlement = await verifyArcGatewaySettlement({
      chainId: ARC_MAINNET_CHAIN_ID,
      rpcUrl: this.options.rpcUrl,
      nonce: accepted.extra.aomiTaskNonce,
      transferId: state.receipt.transaction,
      payer: this.options.payer,
      merchant: this.options.recipient,
      amountMicrousd: accepted.amount
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
};
function parseSmartAccountArtifact(bytes, request, quote, now = Math.floor(Date.now() / 1e3)) {
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
  const calls = artifact.walletCalls.map((raw, index) => {
    const call = object(raw, `Wallet call ${index + 1}`);
    const action = object(build.actions[index], `Task action ${index + 1}`);
    const step = object(report.steps[index], `Simulation step ${index + 1}`);
    const to = address2(call.to);
    requireThat(typeof call.data === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(call.data), "Wallet calldata is invalid");
    const value = exactWei(call.value).toString();
    const expected = requestedCalls[index];
    requireThat(
      address2(expected.to) === to && expected.data.toLowerCase() === call.data.toLowerCase() && exactWei(expected.value).toString() === value,
      "Wallet call differs from the signed Task request"
    );
    requireThat(
      address2(action.from) === address2(request.sender) && address2(action.to) === to && String(action.data).toLowerCase() === call.data.toLowerCase() && exactWei(action.value).toString() === value,
      "Wallet call differs from the frozen action"
    );
    requireThat(
      step.step === index + 1 && executionSucceeded(step.execution?.status) && address2(step.call?.to) === to && String(step.call?.data).toLowerCase() === call.data.toLowerCase() && exactWei(step.call?.value).toString() === value,
      "Wallet call differs from successful simulation evidence"
    );
    return { to, data: call.data.toLowerCase(), value };
  });
  return {
    chainId: request.chainId,
    wallet: address2(request.sender),
    requestHash: quote.requestHash,
    authorizationIdentity: summary.authorizationIdentity,
    codeHash: summary.senderBinding.codeHash,
    counterfactual: summary.senderBinding.counterfactual === true,
    expiresAt: build.expiresAt,
    artifactHash: quote.payloadHash,
    buildDigest,
    calls,
    summary
  };
}
function taskClientWithCircle(options, wallet, approvePurchase) {
  return new TaskClient({
    ...options,
    signTypedData: (typedData) => wallet.signTypedData(typedData, approvePurchase)
  });
}
function mainnetGasBudgetPolicy(budget) {
  requireThat(budget && budget.maxAggregateGasWei > 0n && budget.maxAggregateGasWei <= 100000000000000000n, "Set an Arc Mainnet aggregate gas cap no greater than 0.1 USDC");
  requireThat(budget.alreadySpentGasWei >= 0n && budget.alreadySpentGasWei < budget.maxAggregateGasWei, "Arc Mainnet gas already spent exhausts the approved budget");
  requireThat(budget.maxGasPriceWei > 0n && budget.maxGasPriceWei <= 100000000000n, "Arc Mainnet gas-price cap must be between zero and 100 gwei");
  return {
    maxAggregateGasWei: budget.maxAggregateGasWei.toString(),
    alreadySpentGasWei: budget.alreadySpentGasWei.toString(),
    maxGasPriceWei: budget.maxGasPriceWei.toString()
  };
}
function executionTransactionAtGasPrice(approved, budget, currentGasPrice) {
  requireThat(currentGasPrice > 0n && currentGasPrice <= budget.maxGasPriceWei, "Arc Mainnet gas price exceeds the approved hard cap");
  const gasPrice = currentGasPrice > BigInt(approved.gasPriceWei) ? currentGasPrice : BigInt(approved.gasPriceWei);
  const maxGasCost = BigInt(approved.gasLimitWei) * gasPrice;
  requireThat(budget.alreadySpentGasWei + maxGasCost <= budget.maxAggregateGasWei, "Arc Mainnet refreshed gas price exceeds the remaining aggregate gas budget");
  return immutableSnapshot({ ...approved, gasPriceWei: gasPrice.toString(), maxGasCostWei: maxGasCost.toString() });
}
function object(value, name) {
  requireThat(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value;
}
async function arcRpc(rpcUrl, fetchImpl, method, params) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }, (_, value) => typeof value === "bigint" ? `0x${value.toString(16)}` : value),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const body = await response.json();
  if (body.error || body.result === void 0) throw new Error(`Arc RPC ${method} failed`);
  return body.result;
}
async function readPrivateJson(directory, name) {
  const file = path2.join(directory, name);
  const info = await lstat2(file);
  requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 63) === 0, `${name} must be a private regular journal`);
  return JSON.parse(await readFile(file, "utf8"));
}
async function writePrivateJson(directory, name, value) {
  const file = path2.join(directory, name);
  const temporary = `${file}.${randomUUID()}`;
  const handle = await open2(temporary, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
  const directoryHandle = await open2(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}
function parseMicrousd(value) {
  requireThat(typeof value === "string" && /^\d+(?:\.\d{1,6})?$/.test(value), "Circle Gateway balance is malformed");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
async function arcGatewayBalance(payer, fetchImpl = fetch) {
  const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
  const response = await fetchImpl(`${network.gatewayApi}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ domain: network.gatewayDomain, depositor: address2(payer) }] }),
    redirect: "error",
    signal: AbortSignal.timeout(2e4)
  });
  requireThat(response.ok, `Circle Gateway balance query returned HTTP ${response.status}`);
  const body = await response.json();
  requireThat(body.token === "USDC" && Array.isArray(body.balances), "Circle Gateway balance response is malformed");
  const rows = body.balances.filter((value) => value && Number(value.domain) === network.gatewayDomain && address2(value.depositor) === address2(payer));
  requireThat(rows.length === 1, "Circle Gateway did not return one balance for the selected Mainnet payer");
  const row = rows[0];
  return {
    microusd: parseMicrousd(row.balance),
    pendingBatch: row.pendingBatch == null ? null : String(row.pendingBatch)
  };
}
function callData(signature, args) {
  const abi = [parseAbiItem2(signature)];
  const functionName = signature.slice("function ".length).split("(")[0];
  return encodeFunctionData2({ abi, functionName, args: [...args] });
}
function executionSucceeded(value) {
  return value === "succeeded" || Boolean(value) && typeof value === "object" && !Array.isArray(value) && value.kind === "succeeded";
}
function usdcWei(value) {
  requireThat(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value), "USDC amount must have at most six decimals");
  const [whole, fraction = ""] = value.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  requireThat(wei > 0n, "USDC amount must be positive");
  return wei.toString();
}
function exactWei(value) {
  requireThat(typeof value === "string" && (/^(0|[1-9][0-9]*)$/.test(value) || /^0x[0-9a-f]+$/i.test(value)), "Invalid transaction value");
  return BigInt(value);
}
async function waitForArcTransferReceipt(transactionHash, rpcUrl, chainId, expected, fetchImpl) {
  const deadline = Date.now() + 3e4;
  while (true) {
    try {
      return await verifyArcTransferReceipt(transactionHash, rpcUrl, chainId, expected, fetchImpl);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Arc receipt is not confirmed yet") throw error;
      if (Date.now() >= deadline) {
        throw new Error("Arc transaction is still pending; resume with its existing execution journal and hash");
      }
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
  }
}
function sha256Digest(value) {
  requireThat(typeof value === "string", "Task build digest is invalid");
  const match = /^(?:sha256:)?([0-9a-f]{64})$/i.exec(value);
  requireThat(match, "Task build digest is invalid");
  return match[1].toLowerCase();
}
function parseArcTransferArtifact(bytes, request, quote, amountUsdc, now = Math.floor(Date.now() / 1e3), reference = "task-artifact") {
  const network = arcNetwork(request.chainId);
  let artifact;
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
  requireThat(build.expiresAt >= quote.expiresAt, "Task quote outlives its Build and could authorize payment after simulation expiry");
  const buildDigest = sha256Digest(build.digest);
  requireThat(Array.isArray(build.actions) && build.actions.length === 1, "Execution Kit V1 requires exactly one action");
  const action = object(build.actions[0], "Task action");
  const sender = address2(request.sender);
  const targets = request.constraints?.allowedTargets ?? [];
  requireThat(targets.length === 1, "Execution Kit V1 requires one explicit allowed target");
  const recipient = address2(targets[0]);
  const amountWei = usdcWei(amountUsdc);
  requireThat(
    action.chain_id === request.chainId && address2(action.from) === sender && address2(action.to) === recipient && exactWei(action.value ?? "0") === BigInt(amountWei) && action.data === "0x" && action.kind === "native_transfer",
    "Task action does not match the bounded native-USDC transfer"
  );
  requireThat(build.simulation?.status === "passed", "Build simulation did not pass");
  requireThat(Array.isArray(summary.approvals) && summary.approvals.length === 0, "V1 does not execute token approvals");
  requireThat(summary.actionCount === 1 && summary.source?.chainId === request.chainId, `Task summary does not describe one ${network.displayName} action`);
  requireThat(summary.outgoingUsdcWei === amountWei, "Task summary outflow differs from the approved amount");
  requireThat(Array.isArray(summary.constraints) && summary.constraints.every((item) => item?.status === "passed"), "A Task constraint did not pass");
  requireThat(Array.isArray(report.contexts) && report.contexts.length === 1, "Task report requires one Arc simulation context");
  const context = object(report.contexts[0], "Simulation context");
  const hasLegacyOverrides = Object.prototype.hasOwnProperty.call(context, "balance_overrides");
  const hasCurrentOverrides = Object.prototype.hasOwnProperty.call(context, "overrides");
  const overrides = hasLegacyOverrides ? context.balance_overrides : context.overrides;
  requireThat(context.chain_id === request.chainId && address2(context.sender) === sender && hasLegacyOverrides !== hasCurrentOverrides && Array.isArray(overrides) && overrides.length === 0, "Simulation context does not match the reviewed sender and chain");
  requireThat(Array.isArray(report.steps) && report.steps.length === 1, "Task report requires one successful step");
  const step = object(report.steps[0], "Simulation step");
  const call = object(step.call, "Simulation call");
  const hasLegacyExecution = Object.prototype.hasOwnProperty.call(step, "execution");
  const hasCurrentResult = Object.prototype.hasOwnProperty.call(step, "result");
  const execution = hasLegacyExecution ? step.execution : step.result;
  requireThat(
    step.chain_id === request.chainId && hasLegacyExecution !== hasCurrentResult && executionSucceeded(execution?.status) && address2(call.to) === recipient && exactWei(call.value) === BigInt(amountWei) && call.data === "0x",
    "Simulation evidence differs from the reviewed transfer"
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
    summary
  };
}
var ArcPurchasedArtifact = class {
  #plan;
  #servicePurchaseReceipt;
  #wallet;
  #rpcUrl;
  #stateDirectory;
  #rpcFetch;
  #gasBudget;
  #mainnetApproved;
  #mainnetTransaction;
  #artifactRecovery;
  #persistCheckpoint;
  get plan() {
    return this.#plan;
  }
  get servicePurchaseReceipt() {
    return this.#servicePurchaseReceipt;
  }
  constructor(capability, plan, servicePurchaseReceipt, wallet, rpcUrl, stateDirectory, persistCheckpoint, rpcFetch = fetch, gasBudget, mainnetApproved = false, mainnetTransaction, artifactRecovery) {
    requireThat(capability === arcExecutionKitCapability, "Executable artifacts can only be created from ArcExecutionKit");
    arcNetwork(plan.chainId);
    requireThat(address2(plan.sender) === address2(wallet.walletAddress), "Purchased artifact sender differs from the selected wallet");
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
    this.#artifactRecovery = artifactRecovery && immutableSnapshot(artifactRecovery);
    if (plan.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(
        mainnetApproved && mainnetTransaction?.kind === "business_transfer" && mainnetTransaction.chainId === ARC_MAINNET_CHAIN_ID && mainnetTransaction.to === plan.recipient && mainnetTransaction.valueWei === plan.amountWei && mainnetTransaction.data === "0x",
        "Arc Mainnet artifact requires the exact transaction from the approved pre-purchase preview"
      );
    }
    this.#persistCheckpoint = persistCheckpoint;
    Object.freeze(this);
  }
  async execute(confirm) {
    return withStateLock(this.#stateDirectory, "execution-lock", () => this.executeLocked(confirm));
  }
  async saveExecution(state) {
    await this.#persistCheckpoint(state);
  }
  verifyMainnetExecutionEvidence(state) {
    if (!this.#mainnetTransaction) return;
    requireThat(
      stable(state.artifactRecovery ?? null) === stable(this.#artifactRecovery ?? null),
      "Execution journal artifact recovery evidence is missing or changed"
    );
    const revalidation = state.mainnetRevalidation;
    if (state.phase !== "prepared" || state.circle) {
      requireThat(revalidation, "Execution journal is missing Mainnet revalidation evidence");
    }
    if (!revalidation) return;
    const approved = this.#mainnetTransaction;
    const budget = this.#gasBudget;
    requireThat(budget, "Arc Mainnet execution requires its original gas budget");
    requireThat(
      revalidation.chainId === ARC_MAINNET_CHAIN_ID && Number.isFinite(Date.parse(revalidation.checkedAt)) && revalidation.latestNonce === approved.nonce && revalidation.pendingNonce === approved.nonce && stable(revalidation.approvedTransaction) === stable(approved) && revalidation.executionTransaction?.kind === approved.kind && revalidation.executionTransaction?.chainId === approved.chainId && revalidation.executionTransaction?.nonce === approved.nonce && revalidation.executionTransaction?.to === approved.to && revalidation.executionTransaction?.valueWei === approved.valueWei && revalidation.executionTransaction?.data === approved.data && revalidation.executionTransaction?.gasLimitWei === approved.gasLimitWei && BigInt(revalidation.gasPriceWei) > 0n && BigInt(revalidation.gasPriceWei) <= BigInt(revalidation.executionTransaction.gasPriceWei) && BigInt(revalidation.executionTransaction.gasPriceWei) >= BigInt(approved.gasPriceWei) && BigInt(revalidation.executionTransaction.gasPriceWei) <= budget.maxGasPriceWei && BigInt(revalidation.executionTransaction.maxGasCostWei) === BigInt(approved.gasLimitWei) * BigInt(revalidation.executionTransaction.gasPriceWei) && budget.alreadySpentGasWei + BigInt(revalidation.executionTransaction.maxGasCostWei) <= budget.maxAggregateGasWei && BigInt(revalidation.estimatedGas) > 0n && BigInt(revalidation.estimatedGas) <= BigInt(approved.gasLimitWei) && BigInt(revalidation.payerBalanceWei) >= BigInt(approved.valueWei) + BigInt(revalidation.executionTransaction.maxGasCostWei),
      "Execution journal Mainnet revalidation differs from the approved transaction or limits"
    );
  }
  async executeLocked(confirm) {
    const persisted = await this.#persistCheckpoint();
    let state = persisted.state;
    const gasBudgetPolicy = this.#plan.chainId === ARC_MAINNET_CHAIN_ID ? mainnetGasBudgetPolicy(this.#gasBudget) : void 0;
    if (!state) {
      state = {
        version: 2,
        artifactHash: this.#plan.artifactHash,
        plan: this.#plan,
        servicePurchaseReceipt: this.#servicePurchaseReceipt,
        idempotencyKey: `task-${this.#plan.artifactHash.slice(0, 32)}`,
        ...gasBudgetPolicy ? { gasBudget: gasBudgetPolicy } : {},
        ...this.#mainnetTransaction ? { approvedTransaction: this.#mainnetTransaction } : {},
        ...this.#artifactRecovery ? { artifactRecovery: this.#artifactRecovery } : {},
        phase: "prepared"
      };
      await this.saveExecution(state);
    }
    requireThat(state.artifactHash === this.#plan.artifactHash && stable(state.plan) === stable(this.#plan), "Execution journal belongs to a different Task artifact");
    requireThat(state.idempotencyKey === `task-${this.#plan.artifactHash.slice(0, 32)}`, "Execution journal changed its original idempotency key");
    requireThat(stable(state.servicePurchaseReceipt) === stable(this.#servicePurchaseReceipt), "Execution journal service receipt differs from the verified purchase");
    if (this.#mainnetTransaction) requireThat(stable(state.approvedTransaction) === stable(this.#mainnetTransaction), "Execution journal business transaction differs from the approved pre-purchase preview");
    if (gasBudgetPolicy) requireThat(state.version === 2 && stable(state.gasBudget) === stable(gasBudgetPolicy), "Execution journal gas budget differs from the approved policy; retain the original journal and reconcile it first");
    this.verifyMainnetExecutionEvidence(state);
    if (state.phase === "complete") {
      requireThat(state.circle?.transactionHash === state.receipt?.transactionHash, "Stored Circle and Arc records do not correlate");
      const verifiedReceipt = await verifyArcTransferReceipt(state.circle.transactionHash, this.#rpcUrl, this.#plan.chainId, {
        from: this.#plan.sender,
        to: this.#plan.recipient,
        valueWei: this.#plan.amountWei
      }, this.#rpcFetch);
      if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
        const budget = this.#gasBudget;
        requireThat(budget, "Arc Mainnet execution requires its original gas budget");
        const transactionReceipt = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [state.circle.transactionHash]);
        const minedTransaction = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [state.circle.transactionHash]);
        const rawTransaction = state.circle.raw?.rawTransaction;
        requireThat(typeof rawTransaction === "string", "Stored Mainnet signed transaction is missing");
        const serialized = rawTransaction;
        requireThat(keccak2562(serialized).toLowerCase() === state.circle.transactionHash.toLowerCase(), "Stored Mainnet transaction hash differs from its original signed bytes");
        const parsed = parseTransaction(serialized);
        const signer = await recoverTransactionAddress({ serializedTransaction: serialized });
        const gasUsed = BigInt(transactionReceipt.gasUsed);
        const gasPrice = BigInt(transactionReceipt.effectiveGasPrice ?? minedTransaction.gasPrice);
        const gasCostWei = gasUsed * gasPrice;
        const rawGasCostWei = state.circle.raw?.receipt?.gasCostWei;
        const executionTransaction = state.mainnetRevalidation?.executionTransaction;
        requireThat(
          signer.toLowerCase() === this.#plan.sender.toLowerCase() && parsed.type === "legacy" && BigInt(parsed.chainId) === BigInt(ARC_MAINNET_CHAIN_ID) && BigInt(parsed.nonce) === BigInt(state.circle.raw.nonce) && BigInt(parsed.gas) === 21000n && BigInt(parsed.gasPrice) <= budget.maxGasPriceWei && parsed.to?.toLowerCase() === this.#plan.recipient.toLowerCase() && BigInt(parsed.value) === BigInt(this.#plan.amountWei) && String(parsed.data ?? "0x").toLowerCase() === "0x" && transactionReceipt.status === "0x1" && gasUsed > 0n && gasUsed <= BigInt(parsed.gas) && gasPrice <= budget.maxGasPriceWei && this.#mainnetTransaction && executionTransaction && BigInt(parsed.nonce) === BigInt(this.#mainnetTransaction.nonce) && BigInt(parsed.gas) === BigInt(executionTransaction.gasLimitWei) && BigInt(parsed.gasPrice) === BigInt(executionTransaction.gasPriceWei) && rawGasCostWei === gasCostWei.toString(),
          "Stored Mainnet transaction, signer, or gas record differs from the confirmed reviewed transfer"
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
      idempotencyKey: state.idempotencyKey
    };
    let circle = state.circle;
    if (!circle) {
      if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
        circle = await this.sendBoundedMainnetTransfer(transfer, state, async (review) => {
          const approvedPrice = this.#mainnetTransaction?.gasPriceWei;
          if (review.transaction?.gasPriceWei !== approvedPrice) return Boolean(await confirm?.(review));
          return this.#mainnetApproved || Boolean(await confirm?.(review));
        });
      } else {
        const review = this.#wallet.reviewTransfer(transfer);
        if (!await confirm?.(review)) throw new Error("Circle wallet transfer rejected by the reviewer");
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
      valueWei: this.#plan.amountWei
    }, this.#rpcFetch);
    if (this.#plan.chainId === ARC_MAINNET_CHAIN_ID) {
      const budget = this.#gasBudget;
      requireThat(budget, "Arc Mainnet execution requires its original gas budget");
      const transactionReceipt = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [circle.transactionHash]);
      const minedTransaction = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [circle.transactionHash]);
      const gasUsed = BigInt(transactionReceipt.gasUsed);
      const gasPrice = BigInt(transactionReceipt.effectiveGasPrice ?? minedTransaction.gasPrice);
      const gasCostWei = gasUsed * gasPrice;
      requireThat(transactionReceipt.status === "0x1" && gasUsed <= 21000n && gasPrice <= budget.maxGasPriceWei, "Arc Mainnet receipt exceeded the signed transaction gas envelope");
      requireThat(budget.alreadySpentGasWei + gasCostWei <= budget.maxAggregateGasWei, "Arc Mainnet aggregate gas exceeded its approved hard limit");
      circle = {
        ...circle,
        state: "confirmed",
        raw: {
          ...circle.raw,
          receipt: { transactionHash: circle.transactionHash, gasUsed: gasUsed.toString(), gasPriceWei: gasPrice.toString(), gasCostWei: gasCostWei.toString() }
        }
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
  async sendBoundedMainnetTransfer(transfer, state, confirm) {
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
      arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getBalance", [this.#plan.sender, "latest"]).then(BigInt)
    ]);
    const nonce = BigInt(approved.nonce);
    const gas = BigInt(approved.gasLimitWei);
    requireThat(latestNonce === pendingNonce && latestNonce === nonce, "Arc Mainnet nonce differs from the approved transaction; preserve the journal and reconcile first");
    requireThat(estimate > 0n && estimate <= gas, "Arc Mainnet transfer estimate exceeds the fixed native-transfer gas limit");
    const executionTransaction = executionTransactionAtGasPrice(approved, budget, gasPrice);
    const executionGasPrice = BigInt(executionTransaction.gasPriceWei);
    const maxGasCostWei = BigInt(executionTransaction.maxGasCostWei);
    requireThat(balance >= BigInt(this.#plan.amountWei) + maxGasCostWei, "Arc Mainnet payer balance cannot cover the exact transfer and bounded gas");
    requireThat(approved.kind === "business_transfer" && approved.to === this.#plan.recipient && approved.valueWei === this.#plan.amountWei && approved.data === "0x", "Approved Mainnet transaction differs from the purchased artifact");
    state.mainnetRevalidation = {
      checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
      chainId: ARC_MAINNET_CHAIN_ID,
      latestNonce: latestNonce.toString(),
      pendingNonce: pendingNonce.toString(),
      gasPriceWei: gasPrice.toString(),
      estimatedGas: estimate.toString(),
      payerBalanceWei: balance.toString(),
      approvedTransaction: immutableSnapshot(approved),
      executionTransaction
    };
    await this.saveExecution(state);
    const unsigned = Object.freeze({
      chainId: ARC_MAINNET_CHAIN_ID,
      nonce,
      gas,
      gasPrice: executionGasPrice,
      to: approved.to,
      value: BigInt(this.#plan.amountWei),
      data: approved.data
    });
    const reviewedTransaction = Object.freeze({ ...unsigned });
    const base = this.#wallet.reviewTransfer(transfer);
    const review = immutableSnapshot({
      ...base,
      command: ["Arc Mainnet signed transaction"],
      summary: `Arc Mainnet ${this.#plan.amountUsdc} USDC transfer from ${this.#plan.sender} to ${this.#plan.recipient}; nonce ${nonce}; ${gas} gas at ${executionGasPrice} wei; maximum aggregate gas ${budget.maxAggregateGasWei} wei`,
      transaction: {
        nonce: nonce.toString(),
        to: approved.to,
        valueWei: this.#plan.amountWei,
        data: approved.data,
        gasLimitWei: gas.toString(),
        gasPriceWei: executionGasPrice.toString(),
        maxGasCostWei: maxGasCostWei.toString()
      }
    });
    if (!await confirm(review)) throw new Error("Arc Mainnet transaction rejected by the reviewer");
    const rawTransaction = await this.#wallet.signTransaction(unsigned);
    const parsed = parseTransaction(rawTransaction);
    const signer = await recoverTransactionAddress({ serializedTransaction: rawTransaction });
    requireThat(
      signer.toLowerCase() === this.#plan.sender.toLowerCase() && parsed.type === "legacy" && BigInt(parsed.chainId) === BigInt(reviewedTransaction.chainId) && BigInt(parsed.nonce) === reviewedTransaction.nonce && parsed.to?.toLowerCase() === reviewedTransaction.to.toLowerCase() && BigInt(parsed.value) === reviewedTransaction.value && String(parsed.data ?? "0x").toLowerCase() === reviewedTransaction.data && BigInt(parsed.gas) === reviewedTransaction.gas && BigInt(parsed.gasPrice) === reviewedTransaction.gasPrice,
      "Signed Arc Mainnet transaction differs from the reviewed recipient, amount, nonce, chain, or gas bound"
    );
    const transactionHash = keccak2562(rawTransaction);
    const circle = {
      transactionHash,
      state: "broadcast_pending",
      raw: { rawTransaction, nonce: unsigned.nonce.toString(), gas: gas.toString(), gasPriceWei: executionGasPrice.toString(), maxGasCostWei: maxGasCostWei.toString() }
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
};
var ArcExecutionQuote = class {
  #preview;
  #request;
  #amountUsdc;
  #reference;
  #client;
  #wallet;
  #rpcUrl;
  #setPurchaseApproval;
  #rpcFetch;
  #gasBudget;
  get preview() {
    return this.#preview;
  }
  constructor(capability, preview, request, amountUsdc, reference, client, wallet, rpcUrl, setPurchaseApproval, rpcFetch = fetch, gasBudget) {
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
  now() {
    return this.#client.options.now?.() ?? Math.floor(Date.now() / 1e3);
  }
  async fundingJournal() {
    try {
      return await readPrivateJson(this.#client.options.stateDirectory, "gateway-funding.json");
    } catch (error) {
      if (error.code === "ENOENT") return void 0;
      throw error;
    }
  }
  verifyFundingJournal(journal) {
    const review = journal.review;
    const targets = this.#request.constraints?.allowedTargets;
    const budget = mainnetGasBudgetPolicy(this.#gasBudget);
    requireThat(
      journal.version === 1 && journal.approvalHash === hash(stable(review)) && ["approved", "funding", "funded", "purchased"].includes(journal.status) && review.kind === "arc_mainnet_task_purchase" && review.chainId === ARC_MAINNET_CHAIN_ID && review.taskQuote.quoteId === this.#preview.quoteId && review.taskQuote.requestHash === this.#preview.requestHash && review.taskQuote.payloadHash === this.#preview.payloadHash && review.taskQuote.expiresAt === this.#preview.expiresAt && review.feeMicrousd === String(this.#preview.pricing.fee_microusd) && review.payer === address2(this.#request.sender) && review.merchant === address2(this.#client.options.recipient) && review.startingGasSpentWei === budget.alreadySpentGasWei && review.maxAggregateGasWei === budget.maxAggregateGasWei && review.maxGasPriceWei === budget.maxGasPriceWei && decimal(review.plannedWorstCaseGasWei) + decimal(review.startingGasSpentWei) <= decimal(review.maxAggregateGasWei) && Boolean(targets?.[0]) && review.transactions.some((transaction) => transaction.kind === "business_transfer" && transaction.to === address2(targets?.[0]) && transaction.valueWei === String(this.#request.constraints?.maxOutgoingUsdcWei) && transaction.data === "0x"),
      "Existing Gateway funding approval differs from the exact Mainnet quote and requested transfer"
    );
  }
  async mainnetReview() {
    const existing = await this.fundingJournal();
    if (existing) {
      this.verifyFundingJournal(existing);
      return immutableSnapshot(existing.review);
    }
    const budget = this.#gasBudget;
    requireThat(this.#wallet.transactionSigner, "Arc Mainnet requires an explicit signer for approval, deposit, and the reviewed business transaction");
    requireThat(budget, "Arc Mainnet requires an explicit aggregate gas budget");
    mainnetGasBudgetPolicy(budget);
    requireThat(this.#client.options.maxFeeMicrousd <= 1100000n, "Arc Mainnet Task fee cap cannot exceed 1.1 USDC");
    requireThat(this.#preview.expiresAt > this.now() + 120, "Arc Mainnet quote expires too soon to safely fund and purchase");
    const fee = BigInt(String(this.#preview.pricing.fee_microusd));
    requireThat(fee > 0n && fee <= 1100000n, "Signed Arc Mainnet service fee exceeds the 1.1 USDC limit");
    const state = await readPrivateJson(this.#client.options.stateDirectory, "state.json");
    requireThat(
      state.phase === "quoted" && state.quote?.quoteId === this.#preview.quoteId && state.quote?.payloadHash === this.#preview.payloadHash && state.quote?.requestHash === this.#preview.requestHash,
      "Arc Mainnet preflight is not bound to the current signed Task quote journal"
    );
    const required = JSON.parse(Buffer.from(state.requiredHeader, "base64").toString());
    const paymentNonce = required.accepts?.[0]?.extra?.aomiTaskNonce;
    requireThat(typeof paymentNonce === "string" && /^0x[0-9a-f]{64}$/.test(paymentNonce), "Arc Mainnet quote has no exact payment authorization nonce");
    await verifyArcChainId(this.#rpcUrl, ARC_MAINNET_CHAIN_ID, this.#rpcFetch);
    const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
    const payer = address2(this.#wallet.walletAddress);
    const merchant = address2(this.#client.options.recipient);
    const target = this.#request.constraints?.allowedTargets;
    requireThat(target?.length === 1, "Arc Mainnet requires exactly one reviewed business recipient");
    const recipient = address2(target[0]);
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
      arcGatewayBalance(payer, this.#client.options.gatewayFetch)
    ]);
    requireThat(payerCode === "0x" && recipientCode === "0x", "Arc Mainnet bounded Task flow requires the reviewed payer and recipient to be EOAs");
    requireThat(usdcCode !== "0x" && gatewayCode !== "0x", "Official Arc Mainnet USDC or Gateway contract has no code at the pinned source block");
    requireThat(latestNonce === pendingNonce, "Arc Mainnet has an unexpected pending wallet transaction; reconcile before approval");
    requireThat(gasPrice > 0n && gasPrice <= budget.maxGasPriceWei, "Arc Mainnet gas price exceeds the approved hard cap");
    requireThat(allowance === 0n, "Untracked Gateway allowance exists; reconcile it before Mainnet approval");
    requireThat(gateway.pendingBatch == null || gateway.pendingBatch === "0", "Circle reports a pending Gateway batch; reconcile it before Mainnet funding");
    const deposit = fee > gateway.microusd ? fee - gateway.microusd : 0n;
    requireThat(deposit <= 1100000n, "Additional Arc Mainnet Gateway deposit exceeds 1.1 USDC");
    if (deposit > 0n) requireThat(usdcBalance >= deposit, "Arc Mainnet USDC balance cannot cover the exact Gateway deposit");
    const transactions = [];
    let nonce = latestNonce;
    const specs = [];
    if (deposit > 0n) {
      specs.push({
        kind: "approve",
        to: network.usdc,
        value: 0n,
        data: callData("function approve(address spender,uint256 amount) returns (bool)", [network.gatewayWallet, deposit]),
        maxGas: 100000n
      });
      specs.push({
        kind: "deposit",
        to: network.gatewayWallet,
        value: 0n,
        data: callData("function deposit(address token,uint256 value)", [network.usdc, deposit]),
        maxGas: 200000n
      });
    }
    specs.push({ kind: "business_transfer", to: recipient, value: amountWei, data: "0x", maxGas: 21000n });
    for (const spec of specs) {
      const estimate = spec.kind === "deposit" ? spec.maxGas : BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_estimateGas", [{
        from: payer,
        to: spec.to,
        value: `0x${spec.value.toString(16)}`,
        data: spec.data
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
        maxGasCostWei: (gas * gasPrice).toString()
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
        recipientUsdcMicrousd: recipientUsdc.toString()
      },
      sourceBlock: { number: BigInt(block.number).toString(), hash: block.hash.toLowerCase() },
      transactions,
      plannedWorstCaseGasWei: plannedGas.toString(),
      startingGasSpentWei: budget.alreadySpentGasWei.toString(),
      maxAggregateGasWei: budget.maxAggregateGasWei.toString(),
      maxGasPriceWei: budget.maxGasPriceWei.toString()
    });
  }
  async approveFundingReview(review) {
    return withStateLock(this.#client.options.stateDirectory, "gateway-funding-lock", async () => {
      const existing = await this.fundingJournal();
      if (existing) {
        this.verifyFundingJournal(existing);
        requireThat(stable(existing.review) === stable(review), "Existing Mainnet funding review changed; preserve its original plan");
        return existing;
      }
      const journal = {
        version: 1,
        approvalHash: hash(stable(review)),
        review,
        approvedAt: this.now(),
        status: "approved",
        spentGasWei: "0",
        transactions: {}
      };
      await writePrivateJson(this.#client.options.stateDirectory, "gateway-funding.json", journal);
      return journal;
    });
  }
  async saveFunding(journal) {
    this.verifyFundingJournal(journal);
    await writePrivateJson(this.#client.options.stateDirectory, "gateway-funding.json", journal);
  }
  async fundTransaction(journal, transaction) {
    const prior = journal.transactions[transaction.kind];
    if (!prior) {
      const [latest, pending, gasPrice] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [journal.review.payer, "latest"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [journal.review.payer, "pending"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_gasPrice", []).then(BigInt)
      ]);
      requireThat(latest === pending && latest === BigInt(transaction.nonce), "Arc Mainnet funding nonce changed; keep the original quote and reconcile before signing");
      requireThat(gasPrice > 0n && gasPrice <= BigInt(transaction.gasPriceWei), "Arc Mainnet gas price rose above the approved funding transaction");
      requireThat(BigInt(transaction.gasPriceWei) <= BigInt(journal.review.maxGasPriceWei), "Arc Mainnet funding gas price exceeds the currently approved cap");
      requireThat(
        BigInt(journal.review.startingGasSpentWei) + BigInt(journal.review.plannedWorstCaseGasWei) <= BigInt(journal.review.maxAggregateGasWei),
        "Arc Mainnet funding plan exceeds the currently approved aggregate gas cap"
      );
      const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
      const allowanceData = `0xdd62ed3e${journal.review.payer.slice(2).padStart(64, "0")}${network.gatewayWallet.slice(2).padStart(64, "0")}`;
      const allowance = BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_call", [{ to: network.usdc, data: allowanceData }, "latest"]));
      const deposit = BigInt(journal.review.additionalDepositMicrousd);
      requireThat(
        transaction.kind === "approve" ? allowance === 0n : transaction.kind === "deposit" ? allowance === deposit : true,
        "Arc Mainnet Gateway allowance differs from the approved exact funding step"
      );
      if (transaction.kind === "deposit") {
        const estimate = BigInt(await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_estimateGas", [{
          from: journal.review.payer,
          to: transaction.to,
          value: `0x${BigInt(transaction.valueWei).toString(16)}`,
          data: transaction.data
        }, "latest"]));
        requireThat(estimate > 0n && estimate <= BigInt(transaction.gasLimitWei), "Arc Mainnet approved Gateway deposit no longer passes its exact gas-bound dry-run");
      }
      const unsigned = Object.freeze({
        chainId: ARC_MAINNET_CHAIN_ID,
        nonce: BigInt(transaction.nonce),
        gas: BigInt(transaction.gasLimitWei),
        gasPrice: BigInt(transaction.gasPriceWei),
        to: transaction.to,
        value: BigInt(transaction.valueWei),
        data: transaction.data
      });
      const rawTransaction = await this.#wallet.signTransaction(unsigned);
      const parsed = parseTransaction(rawTransaction);
      const signer = await recoverTransactionAddress({ serializedTransaction: rawTransaction });
      const txHash = keccak2562(rawTransaction);
      requireThat(
        signer.toLowerCase() === journal.review.payer.toLowerCase() && parsed.type === "legacy" && BigInt(parsed.chainId) === BigInt(transaction.chainId) && BigInt(parsed.nonce) === BigInt(transaction.nonce) && parsed.to?.toLowerCase() === transaction.to.toLowerCase() && BigInt(parsed.value ?? 0n) === BigInt(transaction.valueWei) && String(parsed.data ?? "0x").toLowerCase() === transaction.data.toLowerCase() && BigInt(parsed.gas) === BigInt(transaction.gasLimitWei) && BigInt(parsed.gasPrice) === BigInt(transaction.gasPriceWei),
        `Signed Arc Mainnet ${transaction.kind} differs from the approved preview`
      );
      journal.transactions[transaction.kind] = { phase: "signed", hash: txHash, rawTransaction, preview: transaction };
      journal.status = "funding";
      await this.saveFunding(journal);
      let accepted;
      try {
        accepted = await arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_sendRawTransaction", [rawTransaction]);
      } catch {
        const [known, receipt] = await Promise.all([
          arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [txHash]),
          arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [txHash])
        ]);
        if (!known && !receipt) throw new Error(`Arc Mainnet ${transaction.kind} outcome is uncertain; original hash and nonce are journaled; do not create a replacement`);
      }
      requireThat(!accepted || accepted.toLowerCase() === txHash.toLowerCase(), "Arc RPC returned a different hash for the approved funding transaction");
      journal.transactions[transaction.kind].phase = "submitted";
      await this.saveFunding(journal);
    } else {
      requireThat(prior.hash === keccak2562(prior.rawTransaction) && stable(prior.preview) === stable(transaction), "Stored Arc Mainnet funding transaction differs from its approved original");
    }
    const item = journal.transactions[transaction.kind];
    let verified;
    const deadline = Date.now() + 6e4;
    while (!verified && Date.now() < deadline) {
      const [mined, receipt] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionByHash", [item.hash]),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionReceipt", [item.hash])
      ]);
      if (mined && receipt) {
        const parsed = parseTransaction(item.rawTransaction);
        const signer = await recoverTransactionAddress({ serializedTransaction: item.rawTransaction });
        const gasUsed = BigInt(receipt.gasUsed);
        const effectiveGasPrice = BigInt(receipt.effectiveGasPrice ?? mined.gasPrice);
        const gasCostWei = gasUsed * effectiveGasPrice;
        requireThat(
          signer.toLowerCase() === journal.review.payer.toLowerCase() && parsed.type === "legacy" && keccak2562(item.rawTransaction).toLowerCase() === item.hash.toLowerCase() && String(mined.hash).toLowerCase() === item.hash.toLowerCase() && BigInt(mined.chainId) === BigInt(transaction.chainId) && BigInt(mined.nonce) === BigInt(transaction.nonce) && address2(mined.from) === journal.review.payer && address2(mined.to) === transaction.to && BigInt(mined.value) === BigInt(transaction.valueWei) && String(mined.input ?? mined.data).toLowerCase() === transaction.data.toLowerCase() && BigInt(mined.gas) === BigInt(transaction.gasLimitWei) && BigInt(mined.gasPrice) === BigInt(transaction.gasPriceWei) && String(receipt.transactionHash).toLowerCase() === item.hash.toLowerCase() && receipt.status === "0x1" && gasUsed > 0n && gasUsed <= BigInt(transaction.gasLimitWei) && effectiveGasPrice <= BigInt(transaction.gasPriceWei),
          `Arc Mainnet ${transaction.kind} receipt differs from the original approved transaction`
        );
        verified = {
          transactionHash: item.hash,
          blockNumber: BigInt(receipt.blockNumber).toString(),
          blockHash: receipt.blockHash,
          gasUsed: gasUsed.toString(),
          effectiveGasPriceWei: effectiveGasPrice.toString(),
          gasCostWei: gasCostWei.toString(),
          status: "0x1"
        };
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
    requireThat(verified, `Arc Mainnet ${transaction.kind} remains unresolved; retain its original hash and do not replace it`);
    if (item.phase === "confirmed") {
      requireThat(stable(item.receipt) === stable(verified), "Arc Mainnet funding receipt changed during recovery");
    } else {
      item.phase = "confirmed";
      item.receipt = verified;
      journal.spentGasWei = Object.values(journal.transactions).filter((entry) => entry.phase === "confirmed").reduce((sum, entry) => sum + BigInt(entry.receipt.gasCostWei), 0n).toString();
      requireThat(BigInt(journal.spentGasWei) <= BigInt(journal.review.maxAggregateGasWei), "Arc Mainnet actual funding gas exceeds the approved aggregate cap");
      await this.saveFunding(journal);
    }
  }
  async fundGateway(journal) {
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
          (gateway.pendingBatch == null || gateway.pendingBatch === "0") && gateway.microusd >= BigInt(persisted.review.feeMicrousd),
          "Circle Gateway available balance does not cover the exact signed Task fee"
        );
      }
      const business = persisted.review.transactions.find((transaction) => transaction.kind === "business_transfer");
      requireThat(business, "Arc Mainnet funding journal has no reviewed business transaction");
      const [latest, pending] = await Promise.all([
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [persisted.review.payer, "latest"]).then(BigInt),
        arcRpc(this.#rpcUrl, this.#rpcFetch, "eth_getTransactionCount", [persisted.review.payer, "pending"]).then(BigInt)
      ]);
      requireThat(latest === pending && latest === BigInt(business.nonce), "Arc Mainnet business nonce differs from the approved preview after funding");
      let paidRecovery = false;
      if (taskState.paymentSignature && ["settlement_pending", "complete"].includes(taskState.phase)) {
        const { required, accepted, issuedAt } = validateStoredQuote(
          taskState.quote,
          taskState.requiredHeader,
          this.#request,
          this.#client.options
        );
        const payment = JSON.parse(Buffer.from(taskState.paymentSignature, "base64").toString("utf8"));
        const authorization = taskState.authorization;
        const artifact = object(JSON.parse(Buffer.from(String(taskState.bytes ?? ""), "base64").toString("utf8")), "Stored Task artifact");
        const build = object(artifact.build, "Stored Task build");
        paidRecovery = Boolean(
          taskState.quote?.quoteId === persisted.review.taskQuote.quoteId && taskState.quote?.payloadHash === persisted.review.taskQuote.payloadHash && taskState.quote?.requestHash === persisted.review.taskQuote.requestHash && taskState.gatewayFunding?.journalHash === persisted.approvalHash && taskState.taskAuthorization?.signature && Number.isSafeInteger(build.expiresAt) && build.expiresAt > issuedAt + 15 && build.expiresAt >= taskState.quote.expiresAt && typeof taskState.bytes === "string" && hash(Buffer.from(taskState.bytes, "base64")) === taskState.quote.payloadHash && taskState.receipt?.success === true && taskState.receipt?.network === `eip155:${ARC_MAINNET_CHAIN_ID}` && address2(taskState.receipt?.payer) === persisted.review.payer && typeof taskState.receipt?.transaction === "string" && taskState.receipt.transaction.length > 0 && address2(authorization?.from) === persisted.review.payer && address2(authorization?.to) === persisted.review.merchant && authorization?.value === persisted.review.feeMicrousd && authorization?.nonce === persisted.review.paymentNonce && payment.x402Version === 2 && stable(payment.accepted) === stable(accepted) && stable(payment.payload?.authorization) === stable(authorization) && payment.resource?.url === required.resource.url
        );
      }
      requireThat(this.#preview.expiresAt > this.now() + 30 || paidRecovery, "Task quote expired during Gateway funding; preserve the original funding journal and do not sign payment");
      persisted.status = "funded";
      persisted.spentGasWei = Object.values(persisted.transactions).filter((entry) => entry.phase === "confirmed").reduce((sum, entry) => sum + BigInt(entry.receipt.gasCostWei), 0n).toString();
      await this.saveFunding(persisted);
      journal.status = "funded";
      journal.spentGasWei = persisted.spentGasWei;
      journal.transactions = persisted.transactions;
      return persisted;
    });
  }
  async recoverExpiredArtifact(bytes, receipt, settlement, funding) {
    if (this.#request.chainId !== ARC_MAINNET_CHAIN_ID) return void 0;
    const artifact = object(JSON.parse(bytes.toString("utf8")), "Task artifact");
    const build = object(artifact.build, "Task build");
    requireThat(Number.isSafeInteger(build.expiresAt), "Task Build expiry is malformed");
    if (build.expiresAt > this.now() + 15) return void 0;
    requireThat(funding && settlement?.status === "confirmed", "Expired Mainnet artifact requires the original paid quote and independently confirmed Gateway settlement");
    const state = await readPrivateJson(this.#client.options.stateDirectory, "state.json");
    const { required, accepted, issuedAt } = validateStoredQuote(
      state.quote,
      state.requiredHeader,
      this.#request,
      this.#client.options
    );
    const wire = JSON.parse(Buffer.from(String(state.paymentSignature ?? ""), "base64").toString("utf8"));
    requireThat(
      state.phase === "complete" && state.quote?.quoteId === this.#preview.quoteId && state.quote?.payloadHash === this.#preview.payloadHash && state.quote?.requestHash === this.#preview.requestHash && build.expiresAt > issuedAt + 15 && build.expiresAt >= state.quote.expiresAt && state.bytes === bytes.toString("base64") && hash(bytes) === this.#preview.payloadHash && state.taskAuthorization?.signature && state.authorization?.nonce === accepted.extra.aomiTaskNonce && state.authorization?.from === address2(this.#request.sender) && state.authorization?.to === address2(this.#client.options.recipient) && state.authorization?.value === accepted.amount && state.gatewayFunding?.journalHash === funding.approvalHash && state.receipt?.success === true && stable(state.receipt) === stable(receipt) && state.receipt.network === `eip155:${ARC_MAINNET_CHAIN_ID}` && state.receipt.transaction === settlement.transferId && state.settlement?.status === "confirmed" && state.settlement.transactionHash === settlement.transactionHash && wire.x402Version === 2 && stable(wire.accepted) === stable(accepted) && stable(wire.payload?.authorization) === stable(state.authorization) && wire.resource?.url === required.resource.url,
      "Expired Mainnet artifact lacks an intact original authorization, receipt, settlement, or pre-expiry storage record"
    );
    return immutableSnapshot({
      version: 1,
      quoteId: this.#preview.quoteId,
      payloadHash: this.#preview.payloadHash,
      attestationIat: issuedAt,
      quoteExpiresAt: state.quote.expiresAt,
      buildExpiresAt: build.expiresAt,
      paymentNonce: accepted.extra.aomiTaskNonce,
      paymentTransferId: state.receipt.transaction,
      settlementTransactionHash: settlement.transactionHash,
      fundingApprovalHash: funding.approvalHash
    });
  }
  async purchase(confirm) {
    let mainnetReview;
    let mainnetFunding;
    const mainnetApproved = this.#request.chainId === ARC_MAINNET_CHAIN_ID;
    if (mainnetApproved) {
      mainnetReview = await this.mainnetReview();
      mainnetFunding = await this.fundingJournal();
      if (mainnetFunding) {
        this.verifyFundingJournal(mainnetFunding);
      } else {
        if (!await confirm(mainnetReview)) throw new Error("Arc Mainnet funding and Task purchase rejected by the reviewer");
        mainnetFunding = await this.approveFundingReview(mainnetReview);
      }
      mainnetFunding = await this.fundGateway(mainnetFunding);
      await this.#client[markTaskGatewayFundingReady](mainnetReview.taskQuote.quoteId, mainnetReview.feeMicrousd, mainnetFunding.approvalHash);
    } else if (!await confirm(this.#preview)) {
      throw new Error("Aomi service purchase rejected by the reviewer");
    }
    this.#setPurchaseApproval(() => true);
    try {
      const result = await this.#client.purchase(this.#request);
      if (result.status === "pending") return result;
      const artifactRecovery = await this.recoverExpiredArtifact(result.bytes, result.receipt, result.settlement, mainnetFunding);
      const plan = parseArcTransferArtifact(
        result.bytes,
        this.#request,
        this.#preview,
        this.#amountUsdc,
        artifactRecovery?.attestationIat,
        this.#reference
      );
      await this.#client[initializeTaskExecutionLedger](plan.artifactHash, result.receipt);
      let gasBudget = this.#gasBudget;
      let approvedBusinessTransaction;
      if (plan.chainId === ARC_MAINNET_CHAIN_ID) {
        requireThat(result.settlement?.status === "confirmed", "Arc Mainnet Gateway settlement must be independently confirmed before artifact execution");
        requireThat(gasBudget && mainnetFunding && mainnetReview, "Arc Mainnet requires its original funding and gas approval journal");
        approvedBusinessTransaction = mainnetReview.transactions.find((transaction) => transaction.kind === "business_transfer");
        requireThat(
          approvedBusinessTransaction && plan.chainId === approvedBusinessTransaction.chainId && plan.sender === mainnetReview.payer && plan.recipient === approvedBusinessTransaction.to && plan.amountWei === approvedBusinessTransaction.valueWei && approvedBusinessTransaction.data === "0x",
          "Purchased artifact differs from the exact pre-purchase Mainnet transaction preview; preserve the paid artifact and do not execute"
        );
        const payerSettlementGasWei = result.settlement.transactionSender === mainnetReview.payer ? BigInt(result.settlement.gasCostWei) : 0n;
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
        artifactRecovery
      );
    } finally {
      this.#setPurchaseApproval(void 0);
    }
  }
};
var ArcExecutionKit = class _ArcExecutionKit {
  options;
  chainId;
  constructor(options, chainId) {
    const wallet = Object.freeze(new CircleArcWallet({
      walletAddress: options.wallet.walletAddress,
      command: options.wallet.command,
      runner: options.wallet.runner,
      transactionSigner: options.wallet.transactionSigner
    }));
    this.options = immutableSnapshot({ ...options, wallet });
    this.chainId = chainId;
    Object.freeze(this);
  }
  static arcTestnet(options) {
    return new _ArcExecutionKit(options, ARC_TESTNET_CHAIN_ID);
  }
  static arcMainnet(options) {
    return new _ArcExecutionKit(options, ARC_MAINNET_CHAIN_ID);
  }
  async prepare(intent, authorizeTask) {
    await verifyArcChainId(this.options.rpcUrl, this.chainId, this.options.rpcFetch);
    if (this.chainId === ARC_MAINNET_CHAIN_ID) {
      requireThat(this.options.wallet.transactionSigner, "Arc Mainnet requires an explicit signer for the exact bounded business transaction");
      mainnetGasBudgetPolicy(this.options.gasBudget);
      requireThat(this.options.maxFeeMicrousd <= 1100000n, "Arc Mainnet Task fee cap cannot exceed 1.1 USDC");
    }
    requireThat(address2(intent.sender) === address2(this.options.wallet.walletAddress), "Circle wallet must be the selected sender");
    requireThat(Boolean(intent.reference.trim()) && intent.reference.length <= 120, "A short payment reference is required");
    const recipient = address2(intent.recipient);
    const amountWei = usdcWei(intent.amountUsdc);
    const request = {
      intent: intent.intent,
      chainId: this.chainId,
      sender: this.options.wallet.walletAddress,
      payer: this.options.wallet.walletAddress,
      constraints: {
        maxOutgoingUsdcWei: amountWei,
        maxGasUnits: intent.maxGasUnits ?? 1e5,
        allowedTargets: [recipient],
        minimumReceived: []
      }
    };
    let purchaseApproval;
    const client = new TaskClient({
      ...this.options,
      payer: this.options.wallet.walletAddress,
      signTypedData: (typedData) => {
        const primaryType = typedData?.primaryType;
        if (primaryType === "TaskAuthorization") return this.options.wallet.signTypedData(typedData, authorizeTask);
        requireThat(primaryType === "TransferWithAuthorization", "Unsupported typed-data request");
        requireThat(purchaseApproval, "Purchase approval was not established");
        return this.options.wallet.signTypedData(typedData, purchaseApproval);
      }
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
      (approval) => {
        purchaseApproval = approval;
      },
      this.options.rpcFetch,
      this.options.gasBudget
    );
  }
};
export {
  ArcExecutionKit,
  TaskClient,
  fetchTrustedTaskJwks,
  parseArcTransferArtifact,
  parseSmartAccountArtifact,
  taskAuthorizationData,
  taskClientWithCircle,
  validateQuote,
  verifyAttestation
};
