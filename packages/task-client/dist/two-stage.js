// src/two-stage.ts
import { createHash as createHash2, randomBytes, randomUUID as randomUUID2 } from "node:crypto";
import { lstat as lstat3, open as open3, readFile as readFile2, rename as rename2 } from "node:fs/promises";
import path3 from "node:path";
import canonicalize2 from "canonicalize";

// ../circle-arc-wallet/src/index.ts
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
function address(value) {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) throw new Error("Expected a 20-byte EVM address");
  return value.toLowerCase();
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
  const exactAmount = payerDeltas.length === 1 && payerDeltas[0].value === -paymentAmount && merchantDeltas.length === 1 && merchantDeltas[0].value === paymentAmount;
  const aggregateCoversAmount = input.allowAggregatedBatch && payerDeltas.length === 1 && payerDeltas[0].value <= -paymentAmount && merchantDeltas.length === 1 && merchantDeltas[0].value >= paymentAmount;
  if (!exactAmount && !aggregateCoversAmount) {
    throw new Error("Circle Gateway batch deltas do not cover the verified transfer amount");
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
    batchId,
    ...!exactAmount ? { amountVerification: "batch_lower_bound" } : {}
  };
}

// src/index.ts
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
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
var TASK_RESOURCE = "https://chat.aomi.dev/v1/task";
var TASK_ENDPOINT = "/v1/task/build";
var arcExecutionKitCapability = Symbol("ArcExecutionKit capability");
var taskExecutionCheckpoint = Symbol("TaskClient execution checkpoint");
var initializeTaskExecutionLedger = Symbol("TaskClient execution ledger initialization");
var markTaskGatewayFundingReady = Symbol("TaskClient Gateway funding verification");
var hash = (data) => createHash("sha256").update(data).digest("hex");
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

// src/two-stage.ts
var sha256 = (value) => createHash2("sha256").update(value).digest("hex");
var stable2 = (value) => JSON.stringify(
  value,
  (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item
);
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function address3(value) {
  check(typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value), "Invalid Arc address");
  return value.toLowerCase();
}
function object(value, name) {
  check(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value;
}
function decimal2(value) {
  check(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), "Invalid integer amount");
  return BigInt(value);
}
function decode(header) {
  check(/^[A-Za-z0-9+/]+={0,2}$/.test(header) && header.length <= 32768, "Invalid x402 header");
  return object(JSON.parse(Buffer.from(header, "base64").toString("utf8")), "x402 requirement");
}
function canonicalTaskRequest(request) {
  const source = request.constraints ?? null;
  const constraints = source == null ? null : {
    maxOutgoingUsdcWei: source.maxOutgoingUsdcWei ?? null,
    maxGasUnits: source.maxGasUnits == null ? null : String(source.maxGasUnits),
    allowedTargets: (source.allowedTargets ?? []).map(address3),
    minimumReceived: (source.minimumReceived ?? []).map((item) => ({
      asset: item.asset === "native" ? "native" : address3(item.asset),
      amount: String(item.amount)
    }))
  };
  return {
    executionKind: request.executionKind ?? "eoa_transactions",
    transactionSafetyMode: request.transactionSafetyMode ?? null,
    intent: request.intent,
    chainId: String(request.chainId),
    sender: address3(request.sender),
    payer: address3(request.payer ?? request.sender),
    calls: (request.calls ?? []).map((call) => ({ to: address3(call.to), data: call.data.toLowerCase(), value: call.value })),
    constraints
  };
}
var TwoStageTaskClient = class {
  #options;
  #endpoint;
  constructor(options) {
    const endpoint = new URL(options.endpoint);
    check(
      endpoint.pathname === "/v1/task/build" && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password && (endpoint.protocol === "https:" || endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)),
      "Use an explicit Task build endpoint"
    );
    arcNetwork(options.chainId);
    address3(options.payer);
    address3(options.merchant);
    check(options.maxRetrievalMicrousd > 0n, "Set a positive retrieval cap");
    if (options.chainId === 5042) check(Boolean(options.rpcUrl), "Arc Mainnet requires independent settlement verification");
    this.#options = options;
    this.#endpoint = endpoint;
  }
  now() {
    return this.#options.now?.() ?? Math.floor(Date.now() / 1e3);
  }
  file() {
    return path3.join(this.#options.stateDirectory, "two-stage.json");
  }
  async read() {
    try {
      const info = await lstat3(this.file());
      check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && (info.mode & 63) === 0, "Task journal must be a private regular file");
      const journal = JSON.parse(await readFile2(this.file(), "utf8"));
      check(journal.version === 2, "Task journal belongs to another protocol version");
      return journal;
    } catch (error) {
      if (error.code === "ENOENT") return void 0;
      throw error;
    }
  }
  async save(journal) {
    const temporary = `${this.file()}.${randomUUID2()}`;
    const handle = await open3(temporary, "wx", 384);
    try {
      await handle.writeFile(JSON.stringify(journal));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename2(temporary, this.file());
    const directory = await open3(this.#options.stateDirectory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async withJournal(operation) {
    return withStateLock(this.#options.stateDirectory, "two-stage-lock", operation);
  }
  async post(url, body, proof) {
    check(url.origin === this.#endpoint.origin && (url.pathname === this.#endpoint.pathname || url.pathname.startsWith("/v1/task/")), "Task URL left the trusted origin");
    const response = await (this.#options.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...proof ? { "payment-signature": proof } : {} },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(3e4)
    });
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Task response exceeded 4 MiB; retain the original proof");
      }
      chunks.push(item.value);
    }
    return { response, bytes: Buffer.concat(chunks) };
  }
  quote(header, url, stage, expectedHash, expectedAmount) {
    const required = decode(header);
    check(required.x402Version === 2 && Array.isArray(required.accepts) && required.accepts.length === 1, "Unexpected x402 offers");
    check(required.resource?.url === url.href && required.resource?.mimeType === "application/json", "Payment resource differs from requested Task URL");
    check(
      required.extensions?.aomiTask?.payloadHash === expectedHash && required.extensions.aomiTask.quoteId === (stage === "preparation" ? "preparation" : url.pathname.split("/")[3]),
      "Payment requirement is not bound to this Task stage"
    );
    const accepted = object(required.accepts[0], "Arc payment offer");
    const network = arcNetwork(this.#options.chainId);
    check(
      accepted.scheme === "exact" && accepted.network === `eip155:${this.#options.chainId}` && address3(accepted.asset) === network.usdc && address3(accepted.payTo) === address3(this.#options.merchant),
      "Wrong payment scheme, network, asset, or merchant"
    );
    check(
      accepted.extra?.name === "GatewayWalletBatched" && accepted.extra?.version === "1" && address3(accepted.extra.verifyingContract) === network.gatewayWallet && Number.isSafeInteger(accepted.extra.minValiditySeconds) && accepted.extra.minValiditySeconds > 0 && accepted.extra.minValiditySeconds <= 691140 && Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 && accepted.maxTimeoutSeconds <= 300,
      "Unsupported Gateway domain or validity"
    );
    const amount = decimal2(accepted.amount);
    check(amount === (stage === "preparation" ? 10000n : expectedAmount) && (stage === "preparation" || amount <= this.#options.maxRetrievalMicrousd), "Payment amount exceeds the reviewed stage cap");
    return { header, required, accepted, amount: amount.toString(), nonce: `0x${randomBytes(32).toString("hex")}` };
  }
  async sign(quote, stage, request, preview) {
    const approved = await this.#options.approve({
      stage,
      chainId: this.#options.chainId,
      payer: address3(this.#options.payer),
      merchant: address3(this.#options.merchant),
      amountMicrousd: BigInt(quote.amount),
      intent: request.intent,
      summary: preview?.summary,
      pricing: preview?.pricing
    });
    check(approved, `${stage} purchase rejected by reviewer`);
    const now = this.now();
    const validBefore = Math.min(now + 691200, (preview?.expiresAt ?? now + 300) + quote.accepted.extra.minValiditySeconds + 60);
    const authorization = {
      from: address3(this.#options.payer),
      to: address3(this.#options.merchant),
      value: quote.amount,
      validAfter: String(Math.max(0, now - 60)),
      validBefore: String(validBefore),
      nonce: quote.nonce
    };
    const signature = await this.#options.signTypedData({
      domain: {
        name: "GatewayWalletBatched",
        version: "1",
        chainId: this.#options.chainId,
        verifyingContract: arcNetwork(this.#options.chainId).gatewayWallet
      },
      types: { TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" }
      ] },
      primaryType: "TransferWithAuthorization",
      message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) }
    });
    check(/^0x[0-9a-f]{130}$/i.test(signature), "Invalid Gateway signature");
    const proof = Buffer.from(JSON.stringify({
      x402Version: 2,
      accepted: quote.accepted,
      resource: quote.required.resource,
      payload: { signature, authorization }
    })).toString("base64");
    return { quote, authorization, signature, proof };
  }
  receipt(response, payment) {
    const header = response.headers.get("payment-response");
    if (!header) return;
    const receipt = decode(header);
    check(
      receipt.success === true && receipt.network === `eip155:${this.#options.chainId}` && address3(receipt.payer) === address3(this.#options.payer) && typeof receipt.transaction === "string" && receipt.transaction.length > 0,
      "Payment receipt differs from selected Arc payer or network"
    );
    payment.receipt = receipt;
  }
  verifyPreview(preview, state, stored = false) {
    check(state.job, "Task job is missing");
    let attestedAt = this.now();
    if (stored) {
      const parts = preview.attestation.split(".");
      check(parts.length === 3, "Stored Task attestation is malformed");
      const claims2 = object(JSON.parse(Buffer.from(parts[1], "base64url").toString()), "Stored Task attestation");
      check(Number.isSafeInteger(claims2.iat) && claims2.iat <= this.now() + 30, "Stored Task attestation issue time is invalid");
      attestedAt = claims2.iat;
    }
    const claims = verifyAttestation(
      preview.attestation,
      this.#options.trustedJwks,
      `wallet:eip155:${this.#options.chainId}:${address3(this.#options.payer)}`,
      attestedAt
    );
    check(preview.quoteId === state.job.quoteId && preview.quoteId === claims.quoteId && preview.requestHash === state.requestHash && claims.requestHash === state.requestHash && stable2(preview.request) === stable2(canonicalTaskRequest(state.request)) && stable2(claims.request) === stable2(preview.request) && stable2(preview.summary) === stable2(claims.summary) && stable2(preview.pricing) === stable2(claims.pricing) && preview.payloadHash === claims.payloadHash && /^[0-9a-f]{64}$/.test(preview.payloadHash) && preview.expiresAt === claims.exp && Number(claims.chainId) === this.#options.chainId && address3(claims.payer) === address3(this.#options.payer), "Task preview differs from trusted attestation");
    const amount = decimal2(preview.pricing.fee_microusd);
    check(
      amount <= this.#options.maxRetrievalMicrousd && typeof claims.amountMicrousd === "string" && decimal2(claims.amountMicrousd) === amount,
      "Retrieval fee exceeds cap or signed amount"
    );
    check(
      claims.paymentRequiredHash === sha256(preview.paymentRequired ?? ""),
      "Task preview payment requirement differs from attestation"
    );
    if (amount > 0n) {
      check(preview.paymentRequired, "Paid retrieval preview has no x402 requirement");
      this.quote(preview.paymentRequired, new URL(state.job.resultUrl), "retrieval", preview.payloadHash, amount);
    }
    return amount;
  }
  async settle(payment) {
    if (this.#options.chainId !== 5042 || !payment.receipt) return;
    const settlement = await verifyArcGatewaySettlement(
      {
        chainId: 5042,
        rpcUrl: this.#options.rpcUrl,
        nonce: payment.quote.nonce,
        transferId: payment.receipt.transaction,
        payer: this.#options.payer,
        merchant: this.#options.merchant,
        amountMicrousd: payment.quote.amount,
        allowAggregatedBatch: true
      },
      { gatewayFetch: this.#options.gatewayFetch, rpcFetch: this.#options.rpcFetch }
    );
    payment.settlement = settlement;
  }
  job(value) {
    check(typeof value.quoteId === "string" && /^[0-9a-f-]{36}$/i.test(value.quoteId) && typeof value.retrievalToken === "string" && value.retrievalToken.length >= 32, "Invalid private Task job capability");
    const expected = new URL(`/v1/task/${value.quoteId}/`, this.#endpoint.origin);
    const statusUrl = new URL(value.statusUrl);
    const resultUrl = new URL(value.resultUrl);
    check(
      statusUrl.href === new URL("status", expected).href && resultUrl.href === new URL("result", expected).href,
      "Task job URLs left the trusted origin or quote"
    );
    return { quoteId: value.quoteId, retrievalToken: value.retrievalToken, statusUrl: statusUrl.href, resultUrl: resultUrl.href };
  }
  async load(request) {
    try {
      await lstat3(path3.join(this.#options.stateDirectory, "state.json"));
      throw new Error("Legacy Task purchase journal exists; use a fresh private directory for the two-stage protocol");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let state = await this.read();
    const policy = {
      endpoint: this.#endpoint.href,
      chainId: this.#options.chainId,
      payer: address3(this.#options.payer),
      merchant: address3(this.#options.merchant),
      maxRetrievalMicrousd: this.#options.maxRetrievalMicrousd.toString()
    };
    if (request) {
      check(request.chainId === this.#options.chainId && address3(request.payer ?? request.sender) === address3(this.#options.payer), "Wrong Task chain or payer");
      const canonical = canonicalTaskRequest(request);
      const encoded = canonicalize2(canonical);
      check(encoded, "Task request cannot be canonicalized");
      const requestHash = sha256(encoded);
      if (!state) {
        state = { version: 2, policy, request, requestHash };
        await this.save(state);
      }
      check(
        state.requestHash === requestHash && stable2(canonicalTaskRequest(state.request)) === stable2(canonical),
        "Task request differs from private journal; use its original request and payment proofs"
      );
    }
    check(state, "No prepared Task journal");
    check(stable2(state.policy) === stable2(policy), "Task payment policy differs from private journal");
    check(
      state.request.chainId === this.#options.chainId && address3(state.request.payer ?? state.request.sender) === address3(this.#options.payer),
      "Task journal belongs to another Arc payer or chain"
    );
    if (state.preparation) this.verifyStoredPayment(state.preparation, "preparation", this.#endpoint, state.requestHash, 10000n);
    if (state.retrieval) {
      check(state.job && state.preview, "Stored retrieval has no original attested job");
      const amount = this.verifyPreview(state.preview, state, true);
      this.verifyStoredPayment(state.retrieval, "retrieval", new URL(state.job.resultUrl), state.preview.payloadHash, amount);
    }
    return state;
  }
  verifyStoredPayment(payment, stage, url, expectedHash, amount) {
    const quote = this.quote(payment.quote.header, url, stage, expectedHash, amount);
    check(stable2(quote.required) === stable2(payment.quote.required) && stable2(quote.accepted) === stable2(payment.quote.accepted) && quote.amount === payment.quote.amount && /^0x[0-9a-f]{64}$/i.test(payment.quote.nonce), "Stored Task requirement differs from its signed stage");
    const authorization = payment.authorization;
    check(address3(authorization.from) === address3(this.#options.payer) && address3(authorization.to) === address3(this.#options.merchant) && authorization.value === quote.amount && authorization.nonce === payment.quote.nonce && decimal2(authorization.validBefore) > decimal2(authorization.validAfter) && /^0x[0-9a-f]{130}$/i.test(payment.signature), "Stored Task authorization differs from payment policy");
    const wire = object(JSON.parse(Buffer.from(payment.proof, "base64").toString()), "Stored x402 proof");
    check(
      wire.x402Version === 2 && stable2(wire.accepted) === stable2(quote.accepted) && stable2(wire.resource) === stable2(quote.required.resource) && stable2(wire.payload?.authorization) === stable2(authorization) && wire.payload.signature === payment.signature,
      "Stored x402 proof differs from its durable authorization"
    );
  }
  /** Pay only the fixed preparation attempt. A pending result must be resumed with this same journal. */
  async prepare(request) {
    return this.withJournal(async () => {
      const state = await this.load(request);
      if (state.job) return { status: "prepared", quoteId: state.job.quoteId };
      if (!state.preparation) {
        const unpaid = await this.post(this.#endpoint, request);
        check(unpaid.response.status === 402, `Expected preparation challenge, got HTTP ${unpaid.response.status}`);
        const body2 = object(JSON.parse(unpaid.bytes.toString()), "Preparation challenge");
        const header = unpaid.response.headers.get("payment-required");
        check(header && body2.paymentRequired === header && body2.stage === "preparation" && body2.amountMicrousd === "10000", "Preparation body and header differ");
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
  async status() {
    return this.withJournal(async () => {
      const state = await this.load();
      check(state.job, "Preparation has not returned a private job capability");
      const call = await this.post(new URL(state.job.statusUrl), { retrievalToken: state.job.retrievalToken });
      check([200, 202].includes(call.response.status), `Task status returned HTTP ${call.response.status}`);
      const body = object(JSON.parse(call.bytes.toString()), "Task status");
      check(body.quoteId === state.job.quoteId, "Task status returned a different quote");
      if (state.preparation) this.receipt(call.response, state.preparation);
      if (state.preparation?.receipt && state.preparation.settlement?.status !== "confirmed") {
        await this.settle(state.preparation);
        await this.save(state);
      }
      if (body.status === "failed" || body.status === "expired") {
        await this.save(state);
        return { status: "failed" };
      }
      if (body.status !== "ready") {
        await this.save(state);
        return { status: "pending" };
      }
      if (body.purchased === true && state.preview && state.artifact) {
        await this.save(state);
        return { status: "ready", preview: state.preview };
      }
      const header = call.response.headers.get("payment-required");
      check(body.paymentRequired === header, "Task preview body and payment header differ");
      this.verifyPreview(body, state);
      state.preview = body;
      await this.save(state);
      return { status: "ready", preview: state.preview };
    });
  }
  /** Buy the frozen bytes with a second signature; zero-outflow results need no second payment. */
  async retrieve() {
    return this.withJournal(async () => {
      const state = await this.load();
      check(state.job && state.preview && state.preparation, "Poll for an attested ready preview first");
      check(state.preparation.receipt, "Preparation has no accepted payment receipt; poll the same job");
      const preview = state.preview;
      const amount = decimal2(preview.pricing.fee_microusd);
      if (!state.artifact && amount === 0n) this.verifyPreview(preview, state);
      if (!state.artifact && amount > 0n && !state.retrieval) {
        this.verifyPreview(preview, state);
        check(preview.expiresAt > this.now() + 30, "Retrieval quote expires too soon; poll the same job again");
        const quote = this.quote(preview.paymentRequired, new URL(state.job.resultUrl), "retrieval", preview.payloadHash, amount);
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
      if (state.preparation.settlement?.status !== "confirmed") {
        await this.settle(state.preparation);
        await this.save(state);
      }
      if (state.retrieval?.receipt && state.retrieval.settlement?.status !== "confirmed") {
        await this.settle(state.retrieval);
        await this.save(state);
      }
      if (this.#options.chainId === 5042) {
        if (state.preparation.settlement?.status !== "confirmed") return { status: "pending" };
        if (amount > 0n && state.retrieval?.settlement?.status !== "confirmed") return { status: "pending" };
      }
      const bytes = Buffer.from(state.artifact, "base64");
      check(sha256(bytes) === preview.payloadHash, "Stored Task bytes differ from attested hash");
      return { status: "complete", bytes, preview, preparationReceipt: state.preparation.receipt, retrievalReceipt: state.retrieval?.receipt };
    });
  }
};
export {
  TwoStageTaskClient,
  canonicalTaskRequest
};
