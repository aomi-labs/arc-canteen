import assert from "node:assert/strict";
import { lockProcess } from "../test/lock-process.ts";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbiItem, parseAbiParameters, parseTransaction, stringToHex } from "viem";
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID, arcNetwork, CircleArcWallet } from "@arc-canteen/circle-arc-wallet";
import { ArcExecutionKit, TaskClient, fetchTrustedTaskJwks, parseArcTransferArtifact, parseSmartAccountArtifact, taskAuthorizationData, type TaskClientOptions, type TaskQuotePreview, type TaskRequest, validateQuote, verifyAttestation } from "./index.ts";

const payer = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const request = { intent: "Transfer test USDC", chainId: ARC_TESTNET_CHAIN_ID, sender: payer };
const now = 100_000;
const idempotencyKey = "task-idempotency-key";

test("fetches a public JWKS only from the independently selected HTTPS Task origin", async () => {
  const key = { ...generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }), kid: "aomi-task-1", alg: "EdDSA", use: "sig", key_ops: ["verify"] };
  let requested: URL | undefined;
  let requestInit: RequestInit | undefined;
  const jwks = await fetchTrustedTaskJwks("https://api.example/v1/task/build", async (input, init) => {
    requested = new URL(String(input));
    requestInit = init;
    return new Response(JSON.stringify({ keys: [key] }), { status: 200 });
  });
  assert.equal(requested?.href, "https://api.example/.well-known/jwks.json");
  assert.equal(requestInit?.method, "GET");
  assert.equal(requestInit?.credentials, "omit");
  assert.equal(requestInit?.redirect, "error");
  assert.deepEqual(jwks.keys, [key]);
});

test("rejects insecure origins, remote redirects, private keys, duplicate kids, and malformed keys", async () => {
  await assert.rejects(fetchTrustedTaskJwks("http://api.example/v1/task/build"), /HTTPS/);
  await assert.rejects(fetchTrustedTaskJwks("https://user:pass@api.example/v1/task/build"), /HTTPS/);
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build?redirect=1"), /HTTPS/);
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build", async () => new Response(null, { status: 302 })), /HTTP 302/);

  const key = { ...generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }), kid: "aomi-task-1", alg: "EdDSA", use: "sig", key_ops: ["verify"] };
  const fetchDocument = (keys: unknown[]) => async () => new Response(JSON.stringify({ keys }), { status: 200 });
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build", fetchDocument([{ ...key, d: "private" }])), /Invalid or non-public/);
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build", fetchDocument([key, key])), /Duplicate/);
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build", fetchDocument([{ ...key, x: "bad" }])), /Invalid or non-public/);
  await assert.rejects(fetchTrustedTaskJwks("https://api.example/v1/task/build", fetchDocument([])), /Invalid Task JWKS/);
});

test("matches the Rust golden JCS request hash and EIP-712 digest", () => {
  const fixture = taskAuthorizationData({
    executionKind: "smart_account_calls",
    transactionSafetyMode: null,
    intent: "Execute Mandate plan 42",
    chainId: 5_042_002,
    sender: payer,
    payer,
    constraints: {
      maxOutgoingUsdcWei: "0",
      maxGasUnits: 250_000,
      allowedTargets: [recipient],
      minimumReceived: [],
    },
  }, "mandate-42", 1_791_547_200, 1_791_547_500);
  assert.equal(fixture.requestHash, "0x0a45285e041903e90470939358b37a3c0e95e080f59f3bf3fe0f0da7772f903f");
  assert.equal(fixture.digest, "0xea9e8ea48e6e745025f4176a5e56757773adc6565169036c594153e83add23de");
});

function fixture(
  change?: (requirement: any) => void,
  taskRequest: TaskRequest = request,
  changeClaims?: (claims: any) => void,
) {
  const keys = generateKeyPairSync("ed25519");
  const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "trusted", alg: "EdDSA" };
  const constraints = (taskRequest.constraints ?? {}) as Record<string, any>;
  const amountWei = String(constraints.maxOutgoingUsdcWei ?? "0");
  const target = String(constraints.allowedTargets?.[0] ?? recipient);
  const summary = {
    interpretedTask: taskRequest.intent,
    expectedEffects: [],
    approvals: [],
    gas: { gasUnits: "21000" },
    constraints: [{ name: "allowed_targets", status: "passed", message: null }],
    source: { chainId: taskRequest.chainId, blockNumber: 123, blockHash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture" },
    actionCount: 1,
    outgoingUsdcWei: amountWei,
  };
  const artifact = {
    build: {
      version: 2,
      status: "simulated",
      actions: [{ chain_id: taskRequest.chainId, from: taskRequest.sender, to: target, value: amountWei, data: "0x", label: "invoice", kind: "native_transfer" }],
      simulation: { status: "passed" },
      expiresAt: Math.floor(Date.now() / 1_000) + 600,
      digest: `sha256:${"a".repeat(64)}`,
    },
    report: {
      contexts: [{ chain_id: taskRequest.chainId, sender: taskRequest.sender, block_number: 123, block_hash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture", overrides: [] }],
      steps: [{ step: 1, chain_id: taskRequest.chainId, label: "invoice", call: { to: target, value: amountWei, data: "0x", gas_limit: 21_000 }, result: { status: { kind: "succeeded" }, gas_used: 21_000 } }],
    },
    summary,
  };
  const bytes = Buffer.from(JSON.stringify(artifact));
  const payloadHash = createHash("sha256").update(bytes).digest("hex");
  const task = taskAuthorizationData(taskRequest, idempotencyKey, now);
  const quoteId = "00000000-0000-0000-0000-000000000001";
  const network = arcNetwork(taskRequest.chainId);
  const requirement = {
    x402Version: 2,
    resource: { url: "http://127.0.0.1:1234/v1/task/build", description: "Aomi task artifact", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: `eip155:${taskRequest.chainId}`,
      asset: network.usdc,
      amount: "1000000",
      payTo: recipient,
      maxTimeoutSeconds: 300,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: network.gatewayWallet,
        minValiditySeconds: 3600,
        aomiTaskNonce: `0x${"12".repeat(32)}`,
      },
    }],
    extensions: { aomiTask: { quoteId, payloadHash } },
  };
  change?.(requirement);
  const header = Buffer.from(JSON.stringify(requirement)).toString("base64");
  const pricing = { fee_microusd: "1000000", outgoing_usdc_wei: amountWei };
  const taskPayer = taskRequest.payer ?? taskRequest.sender;
  const claims = {
    summary,
    pricing,
    aud: "aomi-task-artifact",
    sub: `wallet:eip155:${taskRequest.chainId}:${String(taskPayer).toLowerCase()}`,
    iat: now,
    exp: now + 300,
    quoteId,
    payloadHash,
    requestHash: task.requestHash.slice(2),
    paymentRequiredHash: createHash("sha256").update(header).digest("hex"),
    chainId: taskRequest.chainId,
    payer: taskPayer,
    amountMicrousd: 1_000_000,
    request: JSON.parse(task.canonical),
  };
  changeClaims?.(claims);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "EdDSA", kid: "trusted" })}.${encode(claims)}`;
  const jwt = `${input}.${sign(null, Buffer.from(input), keys.privateKey).toString("base64url")}`;
  const quote = { quoteId, payloadHash, requestHash: claims.requestHash, expiresAt: claims.exp, retrievalToken: "b".repeat(64), summary, pricing, attestation: jwt, paymentRequired: header };
  const options: TaskClientOptions = {
    endpoint: "http://127.0.0.1:1234/v1/task/build",
    payer: taskPayer,
    recipient,
    maxFeeMicrousd: 1_000_000n,
    trustedJwks: { keys: [jwk] },
    stateDirectory: "unused",
    signTypedData: async () => `0x${"aa".repeat(65)}`,
    idempotencyKey: () => idempotencyKey,
    now: () => now,
  };
  return { quote, header, bytes, options, claims, requirement };
}

function mainnetGatewayFixture(payerAddress: string) {
  const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
  const transferId = "gateway-transfer";
  const nonce = `0x${"12".repeat(32)}` as `0x${string}`;
  const transactionHash = `0x${"98".repeat(32)}` as `0x${string}`;
  const batchId = `0x${"76".repeat(32)}` as `0x${string}`;
  const batchSigner = "0xcccccccccccccccccccccccccccccccccccccccc";
  const calldataBytes = encodeAbiParameters(
    parseAbiParameters("(address depositor, int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress"),
    [[
      { depositor: payerAddress as `0x${string}`, value: -1_000_000n },
      { depositor: recipient as `0x${string}`, value: 1_000_000n },
    ], batchId, 26, network.usdc, network.gatewayWallet],
  );
  const input = encodeFunctionData({
    abi: [parseAbiItem("function submitBatch(bytes calldataBytes, bytes signature)")],
    functionName: "submitBatch",
    args: [calldataBytes, `0x${"aa".repeat(65)}`],
  });
  const batchTopic = keccak256(stringToHex("BatchProcessed(bytes32,address,address)"));
  const batchLog = {
    address: network.gatewayWallet,
    topics: [batchTopic, batchId, `0x${batchSigner.slice(2).padStart(64, "0")}`, `0x${network.usdc.slice(2).padStart(64, "0")}`],
    data: "0x",
  };
  let gatewayFunded = false;
  return {
    transferId,
    nonce,
    transactionHash,
    gatewayFetch: async (input: RequestInfo | URL) => {
      if (new URL(String(input)).pathname.endsWith("/balances")) {
        return new Response(JSON.stringify({ token: "USDC", balances: [{ domain: 26, depositor: payerAddress, balance: gatewayFunded ? "1.000000" : "0.000000", pendingBatch: "0" }] }));
      }
      return new Response(JSON.stringify({ transfers: [{
        id: transferId,
        nonce,
        fromAddress: payerAddress,
        toAddress: recipient,
        sendingNetwork: "eip155:5042",
        recipientNetwork: "eip155:5042",
        token: "USDC",
        amount: "1000000",
        status: "confirmed",
        txHash: transactionHash,
      }] }));
    },
    setGatewayFunded(value: boolean) { gatewayFunded = value; },
    transaction: {
      hash: transactionHash,
      chainId: "0x13b2",
      from: batchSigner,
      to: network.gatewayWallet,
      input,
      gasPrice: "0x174876e800",
    },
    receipt: {
      transactionHash,
      blockNumber: "0x2a",
      status: "0x1",
      gasUsed: "0x30d40",
      effectiveGasPrice: "0x174876e800",
      logs: [batchLog],
    },
  };
}

async function purchaseThroughKit(args: {
  chainId: typeof ARC_MAINNET_CHAIN_ID | typeof ARC_TESTNET_CHAIN_ID;
  intent: { intent: string; reference: string; sender: string; recipient: string; amountUsdc: string; maxGasUnits?: number };
  directory: string;
  wallet: CircleArcWallet;
  rpcFetch: typeof fetch;
  gatewayFetch?: typeof fetch;
  approval?: (preview: any) => boolean | Promise<boolean>;
  gasBudget?: { maxAggregateGasWei: bigint; alreadySpentGasWei: bigint; maxGasPriceWei: bigint };
  fixtureData?: ReturnType<typeof fixture>;
}) {
  const amountWei = (BigInt(args.intent.amountUsdc.split(".")[0]) * 10n ** 18n + BigInt((args.intent.amountUsdc.split(".")[1] ?? "").padEnd(18, "0"))).toString();
  const taskRequest: TaskRequest = {
    intent: args.intent.intent,
    chainId: args.chainId,
    sender: args.intent.sender,
    payer: args.intent.sender,
    constraints: {
      maxOutgoingUsdcWei: amountWei,
      maxGasUnits: args.intent.maxGasUnits ?? 100_000,
      allowedTargets: [args.intent.recipient],
      minimumReceived: [],
    },
  };
  const data = args.fixtureData ?? fixture(undefined, taskRequest);
  const fetchTask: typeof fetch = async (_url, init) => {
    if (new Headers(init?.headers).has("payment-signature")) {
      const paymentReceipt = Buffer.from(JSON.stringify({
        success: true,
        network: `eip155:${args.chainId}`,
        payer: args.intent.sender,
        transaction: "gateway-transfer",
      })).toString("base64");
      return new Response(data.bytes, { status: 200, headers: { "payment-response": paymentReceipt } });
    }
    return new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } });
  };
  const options = {
    endpoint: data.options.endpoint,
    recipient: data.options.recipient,
    maxFeeMicrousd: 1_100_000n,
    trustedJwks: data.options.trustedJwks,
    stateDirectory: args.directory,
    wallet: args.wallet,
    rpcUrl: "https://rpc.example",
    rpcFetch: args.rpcFetch,
    gatewayFetch: args.gatewayFetch,
    gasBudget: args.gasBudget,
    idempotencyKey: () => idempotencyKey,
    now: () => now,
    fetch: fetchTask,
  };
  const kit = args.chainId === ARC_MAINNET_CHAIN_ID
    ? ArcExecutionKit.arcMainnet(options)
    : ArcExecutionKit.arcTestnet(options);
  const quote = await kit.prepare(args.intent, () => true);
  assert.equal(Object.isFrozen(quote), true);
  assert.equal(Object.isFrozen(quote.preview), true);
  assert.throws(() => { (quote as any).client = { purchase: async () => ({ status: "complete" }) }; }, TypeError);
  assert.throws(() => { (quote.preview.summary as any).source.chainId = ARC_TESTNET_CHAIN_ID; }, TypeError);
  const purchased = await quote.purchase(args.approval ?? (() => true));
  if ("status" in purchased) throw new Error("Test purchase unexpectedly pending");
  return purchased;
}

test("fails closed on untrusted keys, changed requests, recipient, payer, fee, or expiry", () => {
  const data = fixture();
  assert.doesNotThrow(() => validateQuote(data.quote, data.header, request, data.options, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, maxFeeMicrousd: 999_999n }, now));
  assert.throws(() => validateQuote(data.quote, data.header, { ...request, intent: "Different task" }, data.options, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, recipient: payer }, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, payer: recipient }, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, data.options, now + 300));
  assert.throws(() => verifyAttestation(data.quote.attestation, { keys: [] }, `wallet:eip155:5042002:${payer}`, now));
});

test("recomputes the canonical request hash instead of trusting matching quote claims", () => {
  const falseHash = "f".repeat(64);
  const data = fixture(undefined, request, (claims) => { claims.requestHash = falseHash; });
  data.quote.requestHash = falseHash;
  assert.throws(() => validateQuote(data.quote, data.header, request, data.options, now), /Quote hash binding mismatch/);
});

test("validates Arc Mainnet quotes against only the Mainnet Gateway domain", () => {
  const mainnetRequest: TaskRequest = { ...request, intent: "Transfer Mainnet USDC", chainId: ARC_MAINNET_CHAIN_ID };
  const mainnet = fixture(undefined, mainnetRequest);
  assert.equal(validateQuote(mainnet.quote, mainnet.header, mainnetRequest, mainnet.options, now).accepted.network, "eip155:5042");
  assert.equal(mainnet.requirement.accepts[0].extra.verifyingContract, "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee");
  const testnetContract = fixture((requirement) => {
    requirement.accepts[0].extra.verifyingContract = arcNetwork(ARC_TESTNET_CHAIN_ID).gatewayWallet;
  }, mainnetRequest);
  assert.throws(() => validateQuote(testnetContract.quote, testnetContract.header, mainnetRequest, testnetContract.options, now), /Unexpected EIP712 domain/);
  assert.throws(() => validateQuote(mainnet.quote, mainnet.header, request, mainnet.options, now));
});

test("Arc Mainnet Execution Kit signs its explicit chain and Circle network", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-prepare-"));
  const amountWei = "10000000000000000";
  const intent = {
    intent: "Pay one QA invoice",
    reference: "QA-MAINNET-1",
    sender: payer,
    recipient,
    amountUsdc: "0.01",
    maxGasUnits: 21_000,
  };
  const taskRequest: TaskRequest = {
    intent: intent.intent,
    chainId: ARC_MAINNET_CHAIN_ID,
    sender: payer,
    payer,
    constraints: {
      maxOutgoingUsdcWei: amountWei,
      maxGasUnits: 21_000,
      allowedTargets: [recipient],
      minimumReceived: [],
    },
  };
  const data = fixture(undefined, taskRequest);
  const commands: string[][] = [];
  const wallet = new CircleArcWallet({
    walletAddress: payer,
    transactionSigner: async () => `0x${"aa".repeat(65)}`,
    runner: async (_command, args) => {
      commands.push([...args]);
      return { stdout: `0x${"aa".repeat(65)}`, stderr: "" };
    },
  });
  try {
    const kit = ArcExecutionKit.arcMainnet({
      endpoint: data.options.endpoint,
      recipient,
      maxFeeMicrousd: 1_000_000n,
      trustedJwks: data.options.trustedJwks,
      stateDirectory: directory,
      wallet,
      rpcUrl: "https://rpc.mainnet.arc.io",
      gasBudget: { maxAggregateGasWei: 100_000_000_000_000_000n, alreadySpentGasWei: 0n, maxGasPriceWei: 100_000_000_000n },
      rpcFetch: async () => new Response(JSON.stringify({ result: "0x13b2" })),
      idempotencyKey: () => idempotencyKey,
      now: () => now,
      fetch: async () => new Response(JSON.stringify(data.quote), {
        status: 402,
        headers: { "payment-required": data.header },
      }),
    });
    const quote = await kit.prepare(intent, () => true);
    assert.equal((quote.preview.summary.source as { chainId: number }).chainId, ARC_MAINNET_CHAIN_ID);
    assert.throws(() => new (Object.getPrototypeOf(quote).constructor)(), /created from ArcExecutionKit/);
    assert.deepEqual(commands[0].slice(-3), ["--chain", "ARC", "--quiet"]);
    const wrongChainKit = ArcExecutionKit.arcMainnet({
      ...kit.options,
      rpcFetch: async () => new Response(JSON.stringify({ result: "0x4cef52" })),
    });
    await assert.rejects(wrongChainKit.prepare(intent, () => true), /does not match the selected chain 5042/);
    assert.equal(commands.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses a Mainnet purchase without an independent Circle settlement RPC", async () => {
  const data = fixture(undefined, { ...request, chainId: ARC_MAINNET_CHAIN_ID });
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-no-settlement-rpc-"));
  let paymentSignatures = 0;
  let paidPosts = 0;
  try {
    const client = new TaskClient({
      ...data.options,
      stateDirectory: directory,
      signTypedData: async (typedData: any) => {
        if (typedData.primaryType === "TransferWithAuthorization") paymentSignatures += 1;
        return `0x${"aa".repeat(65)}`;
      },
      fetch: async (_url, init: any) => {
        if (new Headers(init.headers).has("payment-signature")) paidPosts += 1;
        return new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } });
      },
    });
    await assert.rejects(client.purchase({ ...request, chainId: ARC_MAINNET_CHAIN_ID }), /requires an independent Circle settlement RPC verifier/);
    assert.equal(paymentSignatures, 0);
    assert.equal(paidPosts, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocks direct Mainnet TaskClient purchase without Execution Kit funding approval", async () => {
  const mainnetRequest: TaskRequest = { ...request, chainId: ARC_MAINNET_CHAIN_ID };
  const data = fixture(undefined, mainnetRequest);
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-settlement-recovery-"));
  let signatures = 0;
  let paidPosts = 0;
  try {
    const client = new TaskClient({
      ...data.options,
      stateDirectory: directory,
      rpcUrl: "https://rpc.mainnet.arc.io",
      rpcFetch: async () => new Response(JSON.stringify({ result: "0x13b2" })),
      signTypedData: async () => { signatures += 1; return `0x${"aa".repeat(65)}`; },
      fetch: async (_url, init: any) => {
        if (new Headers(init.headers).has("payment-signature")) {
          paidPosts += 1;
        }
        return new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } });
      },
    });
    await assert.rejects(client.purchase(mainnetRequest), /approved, verified Gateway funding through the Execution Kit/);
    assert.equal(signatures, 1); // Only the non-payment TaskAuthorization was signed during prepare.
    assert.equal(paidPosts, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves the payment journal and original authorization after process termination", async () => {
  const data = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-task-client-"));
  let signatures = 0;
  const sent: string[] = [];
  try {
    const options: TaskClientOptions = {
      ...data.options,
      stateDirectory: directory,
      signTypedData: async () => {
        signatures += 1;
        return `0x${"aa".repeat(65)}`;
      },
      fetch: async (_url, init: any) => {
        const proof = init.headers["payment-signature"];
        if (!proof) return new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } });
        sent.push(proof);
        throw new Error("transport failed after possible acceptance");
      },
    };
    await assert.rejects(new TaskClient(options).purchase(request));
    const saved = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(saved.phase, "pending");
    const originalJournal = await readFile(path.join(directory, "state.json"));
    const crashed = await lockProcess(directory);
    assert.equal(crashed.output, "acquired");
    crashed.child.kill("SIGKILL");
    await crashed.exited;
    assert.deepEqual(await readFile(path.join(directory, "state.json")), originalJournal);
    const receipt = Buffer.from(JSON.stringify({ success: true, payer, network: "eip155:5042002", transaction: "gateway-reference" })).toString("base64");
    const retry: TaskClientOptions = {
      ...options,
      now: () => now + 1_000,
      fetch: async (_url, init: any) => {
        sent.push(init.headers["payment-signature"]);
        return new Response(data.bytes, { status: 200, headers: { "payment-response": receipt } });
      },
    };
    const result = await new TaskClient(retry).purchase(request);
    assert.equal(result.status, "complete");
    assert.equal(signatures, 2);
    assert.equal(sent[0], sent[1]);
    const recovered = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(recovered.idempotencyKey, saved.idempotencyKey);
    assert.equal(recovered.requestHash, saved.requestHash);
    assert.equal(recovered.paymentSignature, saved.paymentSignature);
    assert.deepEqual(recovered.authorization, saved.authorization);
    assert.deepEqual(recovered.taskAuthorization, saved.taskAuthorization);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prepares a verified quote with one Task signature and no payment signature", async () => {
  const data = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-task-preview-"));
  let requests = 0;
  let signatures = 0;
  try {
    const client = new TaskClient({
      ...data.options,
      stateDirectory: directory,
      signTypedData: async () => {
        signatures += 1;
        return `0x${"aa".repeat(65)}`;
      },
      fetch: async () => {
        requests += 1;
        return new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } });
      },
    });
    const preview = await client.prepare(request);
    assert.equal(preview.quoteId, data.quote.quoteId);
    assert.equal(requests, 1);
    assert.equal(signatures, 1);
    const journal = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(journal.phase, "quoted");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refreshes an expiring Task authorization before the first quote", async () => {
  const data = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-task-refresh-"));
  let signatures = 0;
  try {
    const base = {
      ...data.options,
      stateDirectory: directory,
      signTypedData: async () => {
        signatures += 1;
        return `0x${"aa".repeat(65)}`;
      },
      fetch: async () => { throw new Error("quote transport interrupted"); },
    };
    await assert.rejects(new TaskClient(base).prepare(request), /interrupted/);
    const preview = await new TaskClient({
      ...base,
      now: () => now + 280,
      fetch: async () => new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } }),
    }).prepare(request);
    assert.equal(preview.quoteId, data.quote.quoteId);
    assert.equal(signatures, 2);
    const journal = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(journal.idempotencyKey, idempotencyKey);
    assert.equal(journal.requestHash, data.quote.requestHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses a dedicated review for the initial Task authorization", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-kit-authorization-"));
  const target = "0x3333333333333333333333333333333333333333";
  const kitRequest: TaskRequest = {
    intent: "Pay invoice INV-1042",
    chainId: 5_042_002,
    sender: payer,
    payer,
    constraints: {
      maxOutgoingUsdcWei: "1000000000000000000",
      maxGasUnits: 100_000,
      allowedTargets: [target],
      minimumReceived: [],
    },
  };
  const data = fixture(undefined, kitRequest);
  let authorizationReviews = 0;
  const wallet = new CircleArcWallet({
    walletAddress: payer,
    runner: async (_command, args) => {
      assert.deepEqual(args.slice(0, 3), ["wallet", "sign", "typed-data"]);
      return { stdout: `0x${"aa".repeat(65)}`, stderr: "" };
    },
  });
  try {
    const kit = ArcExecutionKit.arcTestnet({
      endpoint: data.options.endpoint,
      recipient,
      maxFeeMicrousd: data.options.maxFeeMicrousd,
      trustedJwks: data.options.trustedJwks,
      stateDirectory: directory,
      idempotencyKey: () => idempotencyKey,
      now: () => now,
      fetch: async () => new Response(JSON.stringify(data.quote), { status: 402, headers: { "payment-required": data.header } }),
      wallet,
      rpcUrl: "https://rpc.example",
      rpcFetch: async () => new Response(JSON.stringify({ result: "0x4cef52" })),
    });
    const quote = await kit.prepare({
      intent: kitRequest.intent,
      sender: payer,
      recipient: target,
      amountUsdc: "1",
      reference: "INV-1042",
    }, (review) => {
      authorizationReviews += 1;
      assert.equal(review.title, "Authorize this exact Aomi Task request");
      return true;
    });
    assert.equal(quote.preview.quoteId, data.quote.quoteId);
    assert.equal(authorizationReviews, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts only one exact successful Arc native-USDC artifact", () => {
  const sender = payer;
  const target = "0x3333333333333333333333333333333333333333";
  const amountWei = "1000000000000000000";
  const boundedRequest = {
    intent: "Pay approved invoice INV-1042",
    chainId: 5_042_002,
    sender,
    payer: sender,
    constraints: {
      maxOutgoingUsdcWei: amountWei,
      maxGasUnits: 100_000,
      allowedTargets: [target],
      minimumReceived: [],
    },
  };
  const summary = {
    interpretedTask: boundedRequest.intent,
    transactionSafety: {},
    expectedEffects: [],
    approvals: [],
    gas: { units: "21000" },
    constraints: [{ name: "allowed_targets", status: "passed", message: null }],
    source: { chainId: 5_042_002, blockNumber: 123, blockHash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture" },
    actionCount: 1,
    outgoingUsdcWei: amountWei,
  };
  const quote: TaskQuotePreview = {
    quoteId: "00000000-0000-0000-0000-000000000001",
    requestHash: "c".repeat(64),
    payloadHash: "a".repeat(64),
    summary,
    pricing: { fee_microusd: "1030000", outgoing_usdc_wei: amountWei },
    expiresAt: now + 300,
  };
  const artifact = {
    build: {
      version: 2,
      status: "simulated",
      actions: [{ chain_id: 5_042_002, from: sender, to: target, value: amountWei, data: "0x", label: "invoice", kind: "native_transfer" }],
      simulation: { status: "passed", balanceChanges: [], approvals: [], fees: [], warnings: [], guards: [], gas: { units: "21000" }, logs: [] },
      expiresAt: now + 300,
      digest: `sha256:${"b".repeat(64)}`,
    },
    report: {
      contexts: [{ chain_id: 5_042_002, sender, block_number: 123, block_hash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture", balance_overrides: [] }],
      steps: [{ step: 1, chain_id: 5_042_002, label: "invoice", call: { to: target, value: amountWei, data: "0x", gas_limit: 21_000 }, execution: { status: { kind: "succeeded" }, return_data: "0x", gas_used: 21_000, logs: [], native_balance: null } }],
    },
    summary,
  };
  const bytes = Buffer.from(JSON.stringify(artifact));
  const plan = parseArcTransferArtifact(bytes, boundedRequest, quote, "1", now);
  assert.throws(() => parseArcTransferArtifact(bytes, boundedRequest, quote, "0.01", now), /does not match/);
  assert.equal(plan.recipient, target);
  assert.equal(plan.amountWei, amountWei);
  assert.equal(plan.buildDigest, "b".repeat(64));
  const currentSchema: any = structuredClone(artifact);
  delete currentSchema.report.contexts[0].balance_overrides;
  currentSchema.report.contexts[0].overrides = [];
  delete currentSchema.report.steps[0].execution;
  currentSchema.report.steps[0].result = { status: { kind: "succeeded" }, gas_used: 21_000 };
  const currentPlan = parseArcTransferArtifact(Buffer.from(JSON.stringify(currentSchema)), boundedRequest, quote, "1", now);
  assert.equal(currentPlan.recipient, target);
  const mainnetRequest = { ...boundedRequest, chainId: ARC_MAINNET_CHAIN_ID };
  const mainnetArtifact = structuredClone(artifact);
  mainnetArtifact.build.actions[0].chain_id = ARC_MAINNET_CHAIN_ID;
  mainnetArtifact.report.contexts[0].chain_id = ARC_MAINNET_CHAIN_ID;
  mainnetArtifact.report.steps[0].chain_id = ARC_MAINNET_CHAIN_ID;
  mainnetArtifact.summary.source.chainId = ARC_MAINNET_CHAIN_ID;
  const mainnetQuote = { ...quote, summary: mainnetArtifact.summary };
  const mainnetPlan = parseArcTransferArtifact(Buffer.from(JSON.stringify(mainnetArtifact)), mainnetRequest, mainnetQuote, "1", now);
  assert.equal(mainnetPlan.chainId, ARC_MAINNET_CHAIN_ID);
  assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(artifact)), mainnetRequest, quote, "1", now), /does not match/);
  const rejectedContextVariants: Array<[string, (candidate: any) => void]> = [
    ["dual override schemas", (candidate) => { candidate.report.contexts[0].balance_overrides = []; }],
    ["malformed legacy overrides", (candidate) => { candidate.report.contexts[0].balance_overrides = null; }],
    ["missing overrides", (candidate) => { delete candidate.report.contexts[0].overrides; }],
    ["malformed current overrides", (candidate) => { candidate.report.contexts[0].overrides = null; }],
  ];
  for (const [name, mutate] of rejectedContextVariants) {
    const candidate = structuredClone(currentSchema);
    mutate(candidate);
    assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(candidate)), boundedRequest, quote, "1", now), /Simulation context/, name);
  }
  const rejectedStepVariants: Array<[string, (candidate: any) => void]> = [
    ["dual execution schemas", (candidate) => { candidate.report.steps[0].execution = { status: { kind: "succeeded" } }; }],
    ["malformed legacy execution", (candidate) => { candidate.report.steps[0].execution = null; }],
    ["missing execution result", (candidate) => { delete candidate.report.steps[0].result; }],
    ["malformed current result", (candidate) => { candidate.report.steps[0].result = null; }],
  ];
  for (const [name, mutate] of rejectedStepVariants) {
    const candidate = structuredClone(currentSchema);
    mutate(candidate);
    assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(candidate)), boundedRequest, quote, "1", now), /Simulation evidence/, name);
  }
  currentSchema.report.contexts[0].overrides.push({ account: target });
  assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(currentSchema)), boundedRequest, quote, "1", now), /Simulation context/);
  artifact.build.actions[0].to = recipient;
  assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(artifact)), boundedRequest, quote, "1", now), /does not match/);
  artifact.build.actions[0].to = target;
  artifact.report.steps[0].execution.status.kind = "reverted";
  assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(artifact)), boundedRequest, quote, "1", now), /differs/);
});

test("accepts exact ordered smart-account calls and rejects byte drift", () => {
  const call = { to: recipient as `0x${string}`, data: "0x12345678" as `0x${string}`, value: "0" };
  const smartRequest = { ...request, executionKind: "smart_account_calls" as const, calls: [call] };
  const summary = {
    requestHash: "d".repeat(64),
    authorizationIdentity: `eip1271:${"e".repeat(64)}`,
    senderBinding: { executionKind: "smart_account_calls", codeHash: `0x${"ab".repeat(32)}`, counterfactual: false, simulationScope: "inner_calls_only" },
  };
  const quote: TaskQuotePreview = {
    quoteId: "00000000-0000-0000-0000-000000000002",
    requestHash: summary.requestHash,
    payloadHash: "f".repeat(64),
    summary,
    pricing: {},
    expiresAt: now + 300,
  };
  const artifact = {
    build: { version: 2, status: "simulated", expiresAt: now + 300, digest: `sha256:${"a".repeat(64)}`, actions: [{ chain_id: 5_042_002, from: payer, ...call }] },
    report: { steps: [{ step: 1, execution: { status: { kind: "succeeded" } }, call }] },
    summary,
    walletCalls: [call],
  };
  const plan = parseSmartAccountArtifact(Buffer.from(JSON.stringify(artifact)), smartRequest, quote, now);
  assert.deepEqual(plan.calls, [call]);
  assert.equal(plan.buildDigest, "a".repeat(64));
  artifact.walletCalls[0].data = "0xdeadbeef";
  assert.throws(() => parseSmartAccountArtifact(Buffer.from(JSON.stringify(artifact)), smartRequest, quote, now), /differs/);
  artifact.walletCalls[0].data = call.data;
  artifact.report.steps[0].execution.status.kind = "reverted";
  assert.throws(() => parseSmartAccountArtifact(Buffer.from(JSON.stringify(artifact)), smartRequest, quote, now), /differs/);
});

test("persists correlated purchase, Circle, and Arc records and replays no transfer", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-execution-journal-"));
  const target = "0x3333333333333333333333333333333333333333" as const;
  const transactionHash = `0x${"56".repeat(32)}` as const;
  let submissions = 0;
  let reviews = 0;
  const wallet = new CircleArcWallet({
    walletAddress: payer,
    runner: async (_command, args) => {
      if (args.slice(0, 3).join(" ") === "wallet sign typed-data") return { stdout: `0x${"aa".repeat(65)}`, stderr: "" };
      submissions += 1;
      return { stdout: JSON.stringify({ transactionHash, state: "complete" }), stderr: "" };
    },
  });
  const rpcFetch: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    if (method === "eth_chainId") return new Response(JSON.stringify({ result: "0x4cef52" }));
    return new Response(JSON.stringify({ result: method === "eth_getTransactionReceipt"
      ? { transactionHash, blockNumber: "0x2a", status: "0x1" }
      : { hash: transactionHash, from: payer, to: target, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  try {
    const purchasedResult = await purchaseThroughKit({
      chainId: ARC_TESTNET_CHAIN_ID,
      intent: { intent: "Pay invoice INV-1042", reference: "INV-1042", sender: payer, recipient: target, amountUsdc: "1" },
      directory,
      wallet,
      rpcFetch,
    });
    const purchased = purchasedResult;
    const beforeExecution = await readFile(path.join(directory, "state.json"));
    const first = await purchased.execute(() => { reviews += 1; return true; });
    const second = await purchased.execute(() => { throw new Error("completed execution must not request another review"); });
    assert.equal(first.receipt.transactionHash, transactionHash);
    assert.equal(second.receipt.transactionHash, transactionHash);
    assert.equal(submissions, 1);
    assert.equal(reviews, 1);
    const taskJournal = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    const ledger = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8"));
    const journal = ledger.executionJournal;
    assert.equal(journal.phase, "complete");
    assert.equal(ledger.executionEverStarted, true);
    assert.equal(taskJournal.executionLedgerInitialized, true);
    assert.equal(journal.artifactHash, purchased.plan.artifactHash);
    assert.equal(journal.servicePurchaseReceipt.transaction, "gateway-transfer");
    assert.equal(journal.circle.transactionHash, journal.receipt.transactionHash);

    await writeFile(path.join(directory, "state.json"), beforeExecution);
    const recoveredAfterTaskRollback = await purchased.execute(() => { throw new Error("recovery must use the separate execution ledger"); });
    assert.equal(recoveredAfterTaskRollback.receipt.transactionHash, transactionHash);
    assert.equal(submissions, 1);

    await rm(path.join(directory, "execution.json"));
    await assert.rejects(purchased.execute(() => true), /Execution ledger is missing/);

    await writeFile(path.join(directory, "execution.json"), JSON.stringify({
      ...ledger,
      executionJournal: { ...journal, circle: { ...journal.circle, transactionHash: `0x${"77".repeat(32)}` }, receipt: { ...journal.receipt, transactionHash: `0x${"77".repeat(32)}` } },
    }), { mode: 0o600 });
    await assert.rejects(purchased.execute(() => true), /Arc RPC chain id does not match|Arc RPC returned|Arc transaction does not match|Arc receipt did not prove/);
    assert.equal(submissions, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("previews exact Mainnet funding and broadcasts one approved business transaction inside the aggregate gas cap", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-bounded-execution-"));
  const account = privateKeyToAccount(("0x" + "01".padStart(64, "0")) as any);
  const target = recipient as any;
  const value = 10_000_000_000_000_000n;
  const network = arcNetwork(ARC_MAINNET_CHAIN_ID);
  const settlement = mainnetGatewayFixture(account.address);
  const transactions = new Map<string, Record<string, any>>();
  const receipts = new Map<string, Record<string, any>>();
  let latestNonce = 0n;
  let allowance = 0n;
  let businessRaw: any | undefined;
  let broadcasts = 0;
  let transactionSignatures = 0;
  let paymentAuthorizations = 0;
  let taskAuthorizations = 0;
  let depositEstimates = 0;
  let reviews = 0;
  const wallet = new CircleArcWallet({
    walletAddress: account.address,
    transactionSigner: async (transaction) => {
      transactionSignatures += 1;
      return account.signTransaction({
        type: "legacy", chainId: transaction.chainId, nonce: Number(transaction.nonce),
        gas: transaction.gas, gasPrice: transaction.gasPrice, to: transaction.to,
        value: transaction.value, data: transaction.data,
      });
    },
    runner: async (_command, args) => {
      if (args.slice(0, 3).join(" ") === "wallet sign typed-data") {
        const typedData = JSON.parse(args[3]);
        if (typedData.primaryType === "TaskAuthorization") taskAuthorizations += 1;
        if (typedData.primaryType === "TransferWithAuthorization") paymentAuthorizations += 1;
        return { stdout: "0x" + "aa".repeat(65), stderr: "" };
      }
      throw new Error("Mainnet must not use the unbounded Circle transfer command");
    },
  });
  const taskRequest: TaskRequest = {
    intent: "Pay one QA invoice",
    chainId: ARC_MAINNET_CHAIN_ID,
    sender: account.address,
    payer: account.address,
    constraints: { maxOutgoingUsdcWei: value.toString(), maxGasUnits: 21_000, allowedTargets: [target], minimumReceived: [] },
  };
  const fixtureData = fixture(undefined, taskRequest);
  const rpcFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const [first] = body.params ?? [];
    let result: any;
    if (body.method === "eth_chainId") result = "0x13b2";
    else if (body.method === "eth_getBlockByNumber") result = { number: "0x100", hash: "0x" + "ab".repeat(32) };
    else if (body.method === "eth_getTransactionCount") result = "0x" + latestNonce.toString(16);
    else if (body.method === "eth_gasPrice") result = "0x3b9aca00";
    else if (body.method === "eth_getBalance") result = "0x1000000000000000000";
    else if (body.method === "eth_getCode") {
      const codeAddress = String(first ?? "").toLowerCase();
      result = codeAddress === network.usdc || codeAddress === network.gatewayWallet ? "0x6000" : "0x";
    }
    else if (body.method === "eth_call") {
      const data = String(first?.data ?? "").toLowerCase();
      if (data.startsWith("0x70a08231")) result = first.data.slice(-40).toLowerCase() === account.address.slice(2).toLowerCase() ? "0x3d0900" : "0x0";
      else if (data.startsWith("0xdd62ed3e")) result = "0x" + allowance.toString(16);
      else result = "0x1";
    } else if (body.method === "eth_estimateGas") {
      const to = String(first?.to ?? "").toLowerCase();
      if (to === network.gatewayWallet) {
        assert.equal(allowance, 1_000_000n, "Gateway deposit must be simulated only after the exact approval is mined");
        depositEstimates += 1;
      }
      result = to === network.usdc ? "0xafc8" : to === network.gatewayWallet ? "0x15f90" : "0x5208";
    } else if (body.method === "eth_sendRawTransaction") {
      broadcasts += 1;
      const raw = first as any;
      const txHash = keccak256(raw);
      const parsed = parseTransaction(raw) as Record<string, any>;
      const nonce = BigInt(parsed.nonce);
      const gas = BigInt(parsed.gas);
      const to = String(parsed.to).toLowerCase();
      const data = String(parsed.data ?? "0x").toLowerCase();
      if (to === network.usdc && data.startsWith("0x095ea7b3")) allowance = 1_000_000n;
      if (to === network.gatewayWallet) {
        allowance = 0n;
        settlement.setGatewayFunded(true);
      }
      if (to === target.toLowerCase()) businessRaw = raw;
      latestNonce = nonce + 1n;
      transactions.set(txHash, {
        hash: txHash, chainId: "0x13b2", nonce: "0x" + nonce.toString(16), from: account.address,
        to, value: "0x" + BigInt(parsed.value ?? 0n).toString(16), input: data,
        gas: "0x" + gas.toString(16), gasPrice: "0x3b9aca00",
      });
      const used = to === network.usdc ? 0xafc8n : to === network.gatewayWallet ? 0x15f90n : 21_000n;
      receipts.set(txHash, {
        transactionHash: txHash, from: account.address, to, blockNumber: "0x101", blockHash: "0x" + "cd".repeat(32),
        status: "0x1", gasUsed: "0x" + used.toString(16), effectiveGasPrice: "0x3b9aca00", logs: [],
      });
      result = txHash;
    } else if (body.method === "eth_getTransactionByHash") {
      result = String(first).toLowerCase() === settlement.transactionHash.toLowerCase() ? settlement.transaction : transactions.get(String(first).toLowerCase()) ?? null;
    } else if (body.method === "eth_getTransactionReceipt") {
      result = String(first).toLowerCase() === settlement.transactionHash.toLowerCase() ? settlement.receipt : receipts.get(String(first).toLowerCase()) ?? null;
    }
    return new Response(JSON.stringify({ result }));
  };
  try {
    const purchased = await purchaseThroughKit({
      chainId: ARC_MAINNET_CHAIN_ID,
      intent: { intent: "Pay one QA invoice", reference: "QA-MAINNET-1", sender: account.address, recipient: target, amountUsdc: "0.01", maxGasUnits: 21_000 },
      directory,
      wallet,
      rpcFetch,
      gatewayFetch: settlement.gatewayFetch,
      fixtureData,
      gasBudget: { maxAggregateGasWei: 1_000_000_000_000_000n, alreadySpentGasWei: 0n, maxGasPriceWei: 100_000_000_000n },
      approval: (preview) => {
        reviews += 1;
        assert.equal(preview.kind, "arc_mainnet_task_purchase");
        assert.equal(preview.chainId, ARC_MAINNET_CHAIN_ID);
        assert.equal(preview.payer, account.address.toLowerCase());
        assert.equal(preview.feeMicrousd, "1000000");
        assert.equal(preview.additionalDepositMicrousd, "1000000");
        assert.equal(preview.additionalAllowanceMicrousd, "1000000");
        assert.equal(preview.initialAllowanceMicrousd, "0");
        assert.equal(preview.transactions.map((tx: any) => tx.kind).join(","), "approve,deposit,business_transfer");
        assert.equal(preview.transactions[0].valueWei, "0");
        assert.equal(preview.transactions[1].to, network.gatewayWallet);
        assert.equal(preview.transactions[2].nonce, "2");
        assert.equal(preview.transactions[2].to, target);
        assert.equal(preview.transactions[2].valueWei, value.toString());
        assert.equal(preview.transactions[2].data, "0x");
        assert.ok(BigInt(preview.plannedWorstCaseGasWei) <= BigInt(preview.maxAggregateGasWei));
        return true;
      },
    });
    const artifactConstructor = Object.getPrototypeOf(purchased).constructor;
    assert.throws(() => new artifactConstructor(), /created from ArcExecutionKit/);
    assert.equal(Object.isFrozen(purchased), true);
    assert.equal(Object.isFrozen(purchased.plan), true);
    assert.throws(() => { (purchased as any).plan = { ...purchased.plan, amountWei: "1" }; }, TypeError);
    assert.throws(() => { (purchased as any).stateDirectory = os.tmpdir(); }, TypeError);
    assert.throws(() => { (purchased as any).gasBudget = { alreadySpentGasWei: 0n }; }, TypeError);
    const first = await purchased.execute();
    const replay = await purchased.execute(() => { throw new Error("A completed transfer must not prompt again"); });
    assert.equal(first.receipt.transactionHash, keccak256(businessRaw!));
    assert.equal(replay.receipt.transactionHash, first.receipt.transactionHash);
    assert.equal(broadcasts, 3);
    assert.equal(transactionSignatures, 3);
    assert.equal(taskAuthorizations, 1);
    assert.equal(paymentAuthorizations, 1);
    assert.equal(depositEstimates, 1);
    assert.equal(reviews, 1);
    const journal = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8")).executionJournal;
    assert.equal(journal.phase, "complete");
    assert.equal(journal.circle.raw.nonce, "2");
    assert.ok(journal.circle.raw.rawTransaction);
    assert.equal(journal.gasBudget.maxAggregateGasWei, "1000000000000000");
    assert.ok(BigInt(journal.gasBudget.alreadySpentGasWei) > 0n);
    assert.ok(BigInt(journal.gasBudget.alreadySpentGasWei) < BigInt(journal.gasBudget.maxAggregateGasWei), "Circle relayer settlement gas is reported separately from payer-paid gas");
    assert.equal(journal.gasBudget.maxGasPriceWei, "100000000000");
    const funding = JSON.parse(await readFile(path.join(directory, "gateway-funding.json"), "utf8"));
    assert.equal(funding.status, "purchased");
    assert.deepEqual(Object.keys(funding.transactions).sort(), ["approve", "deposit"]);
    assert.equal(funding.transactions.approve.phase, "confirmed");
    assert.equal(funding.transactions.deposit.phase, "confirmed");
    const taskState = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(taskState.gatewayFunding.journalHash, funding.approvalHash);
    const executionLedger = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8"));
    await assert.rejects(purchaseThroughKit({
      chainId: ARC_MAINNET_CHAIN_ID,
      intent: { intent: "Pay one QA invoice", reference: "QA-MAINNET-1", sender: account.address, recipient: target, amountUsdc: "0.01", maxGasUnits: 21_000 },
      directory,
      wallet,
      rpcFetch,
      gatewayFetch: settlement.gatewayFetch,
      fixtureData,
      gasBudget: { maxAggregateGasWei: 99_999_999_999_999_999n, alreadySpentGasWei: 0n, maxGasPriceWei: 100_000_000_000n },
    }), /Existing Gateway funding approval differs from the exact Mainnet quote/);
    assert.equal(transactionSignatures, 3, "a changed recovery budget must fail before signing");
    assert.equal(broadcasts, 3, "a changed recovery budget must fail before broadcast");
    executionLedger.executionJournal.gasBudget.maxAggregateGasWei = "90000000000000000";
    await writeFile(path.join(directory, "execution.json"), JSON.stringify(executionLedger));
    await assert.rejects(purchased.execute(), /journal gas budget differs/);
    assert.equal(broadcasts, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a Mainnet gas policy above the hard cap before authorization or signing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-policy-bypass-"));
  const account = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
  let rpcCalls = 0;
  const wallet = new CircleArcWallet({
    walletAddress: account.address,
    transactionSigner: async () => `0x${"aa".repeat(65)}`,
    runner: async () => { throw new Error("Invalid budget must fail before wallet signing"); },
  });
  const rpcFetch: typeof fetch = async () => {
    rpcCalls += 1;
    return new Response(JSON.stringify({ result: "0x13b2" }));
  };
  try {
    await assert.rejects(purchaseThroughKit({
      chainId: ARC_MAINNET_CHAIN_ID,
      intent: { intent: "Pay QA invoice", reference: "QA-MAINNET-1", sender: account.address, recipient, amountUsdc: "0.01" },
      directory,
      wallet,
      rpcFetch,
      gasBudget: {
        maxAggregateGasWei: 100_000_000_000_000_001n,
        alreadySpentGasWei: 0n,
        maxGasPriceWei: 100_000_000_001n,
      },
    }), /no greater than 0.1 USDC/);
    assert.equal(rpcCalls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a Mainnet funding and transfer reserve above the approved gas cap before signing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-mainnet-gas-reject-"));
  const account = privateKeyToAccount(("0x" + "01".padStart(64, "0")) as any);
  const settlement = mainnetGatewayFixture(account.address);
  let signatures = 0;
  let broadcasts = 0;
  let reviews = 0;
  const wallet = new CircleArcWallet({
    walletAddress: account.address,
    transactionSigner: async () => { signatures += 1; return ("0x" + "aa".repeat(65)) as any; },
    runner: async (_command, args) => {
      if (args.slice(0, 3).join(" ") === "wallet sign typed-data") return { stdout: "0x" + "aa".repeat(65), stderr: "" };
      throw new Error("Mainnet must not call the unbounded Circle transfer command");
    },
  });
  const rpcFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const [first] = body.params ?? [];
    const result = body.method === "eth_chainId" ? "0x13b2"
      : body.method === "eth_getBlockByNumber" ? { number: "0x100", hash: "0x" + "ab".repeat(32) }
        : body.method === "eth_getTransactionCount" ? "0x0"
          : body.method === "eth_gasPrice" ? "0x3b9aca00"
            : body.method === "eth_getBalance" ? "0x1000000000000000000"
              : body.method === "eth_getCode" ? ([arcNetwork(ARC_MAINNET_CHAIN_ID).usdc, arcNetwork(ARC_MAINNET_CHAIN_ID).gatewayWallet] as string[]).includes(String(first).toLowerCase()) ? "0x6000" : "0x"
                : body.method === "eth_call" ? (String(first?.data ?? "").toLowerCase().startsWith("0xdd62ed3e") ? "0x0" : String(first?.data ?? "").slice(-40).toLowerCase() === account.address.slice(2).toLowerCase() ? "0x989680" : "0x0")
                  : body.method === "eth_estimateGas" ? "0x5208"
                    : body.method === "eth_sendRawTransaction" ? (() => { broadcasts += 1; return "0x" + "11".repeat(32); })()
                      : undefined;
    return new Response(JSON.stringify({ result }));
  };
  try {
    await assert.rejects(purchaseThroughKit({
      chainId: ARC_MAINNET_CHAIN_ID,
      intent: { intent: "Pay one QA invoice", reference: "QA-MAINNET-1", sender: account.address, recipient, amountUsdc: "0.01", maxGasUnits: 21_000 },
      directory,
      wallet,
      rpcFetch,
      gatewayFetch: settlement.gatewayFetch,
      approval: () => { reviews += 1; return true; },
      gasBudget: { maxAggregateGasWei: 20_000_000_000_000n, alreadySpentGasWei: 0n, maxGasPriceWei: 100_000_000_000n },
    }), /aggregate 0.1 USDC cap/);
    assert.equal(reviews, 0);
    assert.equal(signatures, 0);
    assert.equal(broadcasts, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retries an uncertain Circle submission with the same idempotency key", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-execution-recovery-"));
  const target = "0x3333333333333333333333333333333333333333" as const;
  const transactionHash = `0x${"67".repeat(32)}` as const;
  const commands: string[][] = [];
  const wallet = new CircleArcWallet({
    walletAddress: payer,
    runner: async (_command, args) => {
      if (args.slice(0, 3).join(" ") === "wallet sign typed-data") return { stdout: `0x${"aa".repeat(65)}`, stderr: "" };
      commands.push([...args]);
      if (commands.length === 1) throw new Error("transport failed after possible submission");
      return { stdout: JSON.stringify({ transactionHash, state: "complete" }), stderr: "" };
    },
  });
  const rpcFetch: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    if (method === "eth_chainId") return new Response(JSON.stringify({ result: "0x4cef52" }));
    return new Response(JSON.stringify({ result: method === "eth_getTransactionReceipt"
      ? { transactionHash, blockNumber: "0x2c", status: "0x1" }
      : { hash: transactionHash, from: payer, to: target, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  try {
    const purchasedResult = await purchaseThroughKit({
      chainId: ARC_TESTNET_CHAIN_ID,
      intent: { intent: "Pay invoice INV-1042", reference: "INV-1042", sender: payer, recipient: target, amountUsdc: "1" },
      directory,
      wallet,
      rpcFetch,
    });
    const purchased = purchasedResult;
    await assert.rejects(purchased.execute(() => true), /transport failed/);
    const pending = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8")).executionJournal;
    assert.equal(pending.phase, "submission_pending");
    await purchased.execute(() => true);
    const firstKey = commands[0][commands[0].indexOf("--idempotency-key") + 1];
    const secondKey = commands[1][commands[1].indexOf("--idempotency-key") + 1];
    assert.equal(firstKey, secondKey);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a quote that selects a different Gateway signing domain", () => {
  for (const change of [
    (required: any) => (required.accepts[0].extra.verifyingContract = payer),
    (required: any) => (required.accepts[0].extra.name = "USDC"),
    (required: any) => (required.accepts[0].extra.version = "2"),
    (required: any) => delete required.accepts[0].extra.aomiTaskNonce,
  ]) {
    const data = fixture(change);
    assert.throws(() => validateQuote(data.quote, data.header, request, data.options, now));
  }
});


test("payment resource must match the configured absolute Task endpoint", () => {
  for (const url of ["https://other.example/v1/task/build", "/v1/task/build", "/v1/tasks/quotes/00000000-0000-0000-0000-000000000001/purchase"]) {
    const data = fixture(requirement => { requirement.resource.url = url; });
    assert.throws(() => validateQuote(data.quote, data.header, request, data.options, now), /Unexpected payment resource/);
  }
});
