import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { CircleArcWallet } from "@arc-canteen/circle-arc-wallet";
import { ArcPurchasedArtifact, TaskClient, parseArcTransferArtifact, type ArcTransferPlan, type TaskClientOptions, type TaskQuotePreview, validateQuote, verifyAttestation } from "./index.ts";

const payer = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const request = { intent: "Transfer test USDC", chainId: 5_042_002, sender: payer };
const now = 100_000;

function fixture(change?: (requirement: any) => void) {
  const keys = generateKeyPairSync("ed25519");
  const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "trusted", alg: "EdDSA" };
  const bytes = Buffer.from('{ "build": {"actions":[]} }');
  const payloadHash = createHash("sha256").update(bytes).digest("hex");
  const quoteId = "00000000-0000-0000-0000-000000000001";
  const requirement = {
    x402Version: 2,
    resource: { url: `/v1/tasks/quotes/${quoteId}/purchase`, description: "Aomi task artifact", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "1000000",
      payTo: recipient,
      maxTimeoutSeconds: 300,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
        minValiditySeconds: 3600,
        aomiTaskNonce: `0x${"12".repeat(32)}`,
      },
    }],
    extensions: { aomiTask: { quoteId, payloadHash } },
  };
  change?.(requirement);
  const header = Buffer.from(JSON.stringify(requirement)).toString("base64");
  const summary = {
    interpretedTask: request.intent,
    expectedEffects: [],
    approvals: [],
    gas: { gasUnits: "21000" },
    constraints: [],
    source: { chainId: 5_042_002, blockNumber: 123, blockHash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture" },
    actionCount: 1,
  };
  const pricing = { fee_microusd: "1000000", outgoing_usdc_wei: "0" };
  const claims = {
    summary,
    pricing,
    aud: "aomi-task-artifact",
    sub: "account:test",
    iat: now,
    exp: now + 300,
    quoteId,
    payloadHash,
    requestHash: "a".repeat(64),
    paymentRequiredHash: createHash("sha256").update(header).digest("hex"),
    chainId: 5_042_002,
    payer,
    amountMicrousd: 1_000_000,
    request: { ...request, payer, constraints: null },
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "EdDSA", kid: "trusted" })}.${encode(claims)}`;
  const jwt = `${input}.${sign(null, Buffer.from(input), keys.privateKey).toString("base64url")}`;
  const quote = { quoteId, payloadHash, requestHash: claims.requestHash, expiresAt: claims.exp, retrievalToken: "b".repeat(64), summary, pricing, attestation: jwt, paymentRequired: header };
  const options: TaskClientOptions = {
    endpoint: "http://127.0.0.1:1234/v1/task/build",
    token: () => "test-not-real",
    subject: "account:test",
    payer,
    recipient,
    maxFeeMicrousd: 1_000_000n,
    trustedJwks: { keys: [jwk] },
    stateDirectory: "unused",
    signTypedData: async () => `0x${"aa".repeat(65)}`,
    now: () => now,
  };
  return { quote, header, bytes, options, claims, requirement };
}

test("fails closed on untrusted keys, changed requests, recipient, payer, fee, or expiry", () => {
  const data = fixture();
  assert.doesNotThrow(() => validateQuote(data.quote, data.header, request, data.options, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, maxFeeMicrousd: 999_999n }, now));
  assert.throws(() => validateQuote(data.quote, data.header, { ...request, intent: "Different task" }, data.options, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, recipient: payer }, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, { ...data.options, payer: recipient }, now));
  assert.throws(() => validateQuote(data.quote, data.header, request, data.options, now + 300));
  assert.throws(() => verifyAttestation(data.quote.attestation, { keys: [] }, data.options.subject, now));
});

test("persists one authorization through an unknown delivery and recovery", async () => {
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
    assert.equal(signatures, 1);
    assert.equal(sent[0], sent[1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prepares a verified quote without signing or purchasing it", async () => {
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
    assert.equal(signatures, 0);
    const journal = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
    assert.equal(journal.phase, "quoted");
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
      digest: "b".repeat(64),
    },
    report: {
      contexts: [{ chain_id: 5_042_002, sender, block_number: 123, block_hash: `0x${"ab".repeat(32)}`, engine: "fixture", rules: "fixture", balance_overrides: [] }],
      steps: [{ step: 1, chain_id: 5_042_002, label: "invoice", call: { to: target, value: amountWei, data: "0x", gas_limit: 21_000 }, execution: { status: "succeeded", return_data: "0x", gas_used: 21_000, logs: [], native_balance: null } }],
    },
    summary,
  };
  const bytes = Buffer.from(JSON.stringify(artifact));
  const plan = parseArcTransferArtifact(bytes, boundedRequest, quote, "1", now);
  assert.equal(plan.recipient, target);
  assert.equal(plan.amountWei, amountWei);
  artifact.build.actions[0].to = recipient;
  assert.throws(() => parseArcTransferArtifact(Buffer.from(JSON.stringify(artifact)), boundedRequest, quote, "1", now), /does not match/);
});

test("persists correlated purchase, Circle, and Arc records and replays no transfer", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arc-execution-journal-"));
  const target = "0x3333333333333333333333333333333333333333" as const;
  const transactionHash = `0x${"56".repeat(32)}` as const;
  let submissions = 0;
  let reviews = 0;
  const wallet = new CircleArcWallet({
    walletAddress: payer,
    runner: async () => {
      submissions += 1;
      return { stdout: JSON.stringify({ transactionHash, state: "complete" }), stderr: "" };
    },
  });
  const rpcFetch: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    return new Response(JSON.stringify({ result: method === "eth_getTransactionReceipt"
      ? { transactionHash, blockNumber: "0x2a", status: "0x1" }
      : { hash: transactionHash, from: payer, to: target, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  const plan: ArcTransferPlan = {
    chainId: 5_042_002,
    sender: payer,
    recipient: target,
    amountUsdc: "1",
    amountWei: "1000000000000000000",
    reference: "INV-1042",
    artifactHash: "a".repeat(64),
    buildDigest: "b".repeat(64),
    expiresAt: now + 300,
    simulation: { status: "passed" },
    summary: { actionCount: 1 },
  };
  try {
    const purchased = new ArcPurchasedArtifact(plan, { transaction: "gateway-purchase" }, wallet, "https://rpc.example", directory, rpcFetch);
    const first = await purchased.execute(() => { reviews += 1; return true; });
    const second = await purchased.execute(() => { throw new Error("completed execution must not request another review"); });
    assert.equal(first.receipt.transactionHash, transactionHash);
    assert.equal(second.receipt.transactionHash, transactionHash);
    assert.equal(submissions, 1);
    assert.equal(reviews, 1);
    const journal = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8"));
    assert.equal(journal.phase, "complete");
    assert.equal(journal.artifactHash, plan.artifactHash);
    assert.equal(journal.servicePurchaseReceipt.transaction, "gateway-purchase");
    assert.equal(journal.circle.transactionHash, journal.receipt.transactionHash);
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
      commands.push([...args]);
      if (commands.length === 1) throw new Error("transport failed after possible submission");
      return { stdout: JSON.stringify({ transactionHash, state: "complete" }), stderr: "" };
    },
  });
  const rpcFetch: typeof fetch = async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    return new Response(JSON.stringify({ result: method === "eth_getTransactionReceipt"
      ? { transactionHash, blockNumber: "0x2c", status: "0x1" }
      : { hash: transactionHash, from: payer, to: target, value: "0xde0b6b3a7640000", input: "0x" } }));
  };
  const plan: ArcTransferPlan = {
    chainId: 5_042_002,
    sender: payer,
    recipient: target,
    amountUsdc: "1",
    amountWei: "1000000000000000000",
    reference: "INV-1042",
    artifactHash: "c".repeat(64),
    buildDigest: "d".repeat(64),
    expiresAt: now + 300,
    simulation: { status: "passed" },
    summary: { actionCount: 1 },
  };
  try {
    const purchased = new ArcPurchasedArtifact(plan, { transaction: "gateway-purchase" }, wallet, "https://rpc.example", directory, rpcFetch);
    await assert.rejects(purchased.execute(() => true), /transport failed/);
    const pending = JSON.parse(await readFile(path.join(directory, "execution.json"), "utf8"));
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
