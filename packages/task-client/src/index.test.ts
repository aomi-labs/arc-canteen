import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { TaskClient, type TaskClientOptions, validateQuote, verifyAttestation } from "./index.ts";

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
