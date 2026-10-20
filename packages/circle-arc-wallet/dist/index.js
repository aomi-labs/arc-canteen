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
  const hash = readString(raw, ["transactionHash", "txHash", "tx_hash", "hash"]);
  if (hash && !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Circle returned an invalid transaction hash");
  return {
    transactionId: readString(raw, ["transactionId", "transaction_id", "id"]),
    transactionHash: hash?.toLowerCase(),
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
  const hash = readString(body.result, ["transactionHash"]);
  const blockNumber = readString(body.result, ["blockNumber"]);
  const status = readString(body.result, ["status"]);
  if (hash?.toLowerCase() !== transactionHash.toLowerCase() || !/^0x[0-9a-f]+$/i.test(blockNumber ?? "") || status !== "0x1") {
    throw new Error("Arc receipt did not prove a successful transaction");
  }
  const rawLogs = body.result.logs;
  if (rawLogs !== void 0 && (!Array.isArray(rawLogs) || !rawLogs.every((log) => Boolean(log) && typeof log === "object" && !Array.isArray(log)))) {
    throw new Error("Arc receipt contains malformed logs");
  }
  return {
    transactionHash: hash.toLowerCase(),
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
async function verifyArcCallReceipt(transactionHash, rpcUrl, chainId, fetchImpl = fetch) {
  return verifyArcReceipt(transactionHash, rpcUrl, chainId, fetchImpl);
}
export {
  ARC_MAINNET,
  ARC_MAINNET_CHAIN_ID,
  ARC_TESTNET,
  ARC_TESTNET_CHAIN_ID,
  CircleArcWallet,
  arcNetwork,
  normalizeCircleTransferResult,
  runCommand,
  verifyArcCallReceipt,
  verifyArcChainId,
  verifyArcGatewaySettlement,
  verifyArcReceipt,
  verifyArcTransferReceipt
};
