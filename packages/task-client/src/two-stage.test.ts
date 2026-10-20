import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import canonicalize from "canonicalize";
import { arcNetwork } from "@arc-canteen/circle-arc-wallet";
import { TwoStageTaskClient, canonicalTaskRequest } from "./two-stage.ts";

const chainId = 5042002 as const;
const payer = "0x1111111111111111111111111111111111111111";
const merchant = "0x2222222222222222222222222222222222222222";
const endpoint = "https://api-staging.aomi.dev/v1/task/build";
const quoteId = "11111111-2222-3333-4444-555555555555";
const token = "t".repeat(64);
const now = 1_800_000_000;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function fixture(retrievalAmount = "300", alter?: "preparation_amount" | "preview_hash", networkChainId: 5042 | 5042002 = chainId) {
  const request = { intent: "Simulate a bounded Arc transfer", chainId: networkChainId, sender: payer, payer,
    constraints: { maxOutgoingUsdcWei: "1000000000000000000", maxGasUnits: 100000, allowedTargets: [merchant], minimumReceived: [] } };
  const canonical = canonicalTaskRequest(request);
  const requestHash = digest(canonicalize(canonical)!);
  const artifact = Buffer.from(JSON.stringify({ summary: { outgoingUsdcWei: "1000000000000000000" }, build: { status: "simulated" } }));
  const payloadHash = digest(artifact);
  const network = arcNetwork(networkChainId);
  const requirement = (stage: "preparation" | "retrieval", amount: string, hash: string) => b64({
    x402Version: 2,
    resource: { url: stage === "preparation" ? endpoint : `https://api-staging.aomi.dev/v1/task/${quoteId}/result`, mimeType: "application/json" },
    extensions: { aomiTask: { quoteId: stage === "preparation" ? "preparation" : quoteId, payloadHash: hash } },
    accepts: [{ scheme: "exact", network: `eip155:${networkChainId}`, asset: network.usdc, payTo: merchant,
      amount, maxTimeoutSeconds: 300,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: network.gatewayWallet, minValiditySeconds: 604800 } }],
  });
  const preparationHeader = requirement("preparation", alter === "preparation_amount" ? "11000" : "10000", requestHash);
  const retrievalHeader = requirement("retrieval", retrievalAmount, payloadHash);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  const trustedJwks = { keys: [{ ...jwk, kid: "test-key", use: "sig", key_ops: ["verify"], alg: "EdDSA" }] };
  const summary = { source: { chainId }, outgoingUsdcWei: "1000000000000000000" };
  const pricing = { fee_microusd: retrievalAmount, preparation_fee_microusd: "10000" };
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "test-key" })).toString("base64url");
  const claims = { aud: "aomi-task-artifact", sub: `wallet:eip155:${networkChainId}:${payer}`, iat: now, exp: now + 300,
    quoteId, requestHash, request: canonical, summary, pricing, payloadHash, chainId: networkChainId, payer,
    amountMicrousd: retrievalAmount, paymentRequiredHash: digest(retrievalHeader) };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const jwt = `${header}.${payload}.${sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
  const preview = { status: "ready", quoteId, requestHash, request: canonical, summary, pricing,
    payloadHash: alter === "preview_hash" ? "0".repeat(64) : payloadHash, expiresAt: now + 300,
    paymentRequired: retrievalHeader, attestation: jwt };
  const receipt = (stage: string) => b64({ success: true, network: `eip155:${networkChainId}`, payer, transaction: `${stage}-transfer` });
  const paidRequests: { url: string; proof: string; body: string }[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const proof = new Headers(init?.headers).get("payment-signature");
    const body = String(init?.body);
    if (proof) paidRequests.push({ url, proof, body });
    if (url === endpoint && !proof)
      return new Response(JSON.stringify({ stage: "preparation", amountMicrousd: "10000", paymentRequired: preparationHeader }),
        { status: 402, headers: { "payment-required": preparationHeader } });
    if (url === endpoint && proof)
      return new Response(JSON.stringify({ quoteId, retrievalToken: token,
        statusUrl: `https://api-staging.aomi.dev/v1/task/${quoteId}/status`,
        resultUrl: `https://api-staging.aomi.dev/v1/task/${quoteId}/result` }),
      { status: 202, headers: { "payment-response": receipt("preparation") } });
    if (url.endsWith(`/${quoteId}/status`))
      return new Response(JSON.stringify(preview), { status: 200,
        headers: { "payment-required": retrievalHeader, "payment-response": receipt("preparation") } });
    if (url.endsWith(`/${quoteId}/result`) && (proof || retrievalAmount === "0"))
      return new Response(artifact, { status: 200, headers: proof ? { "payment-response": receipt("retrieval") } : {} });
    throw new Error(`Unexpected mock Task request: ${url}`);
  };
  return { request, trustedJwks, mockFetch, paidRequests, artifact };
}

test("two independently approved payments reuse exact proofs and deliver attested bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aomi-two-stage-"));
  try {
    const f = fixture();
    const approvals: string[] = [];
    let signatures = 0;
    const client = new TwoStageTaskClient({ endpoint, chainId, payer, merchant, stateDirectory: directory,
      trustedJwks: f.trustedJwks, maxRetrievalMicrousd: 500n, fetch: f.mockFetch, now: () => now,
      approve: ({ stage }) => { approvals.push(stage); return true; },
      signTypedData: async () => { signatures++; return `0x${"a".repeat(130)}`; } });
    assert.deepEqual(await client.prepare(f.request), { status: "prepared", quoteId });
    assert.deepEqual(await client.prepare(f.request), { status: "prepared", quoteId });
    assert.equal((await client.status()).status, "ready");
    const result = await client.retrieve();
    assert.equal(result.status, "complete");
    if (result.status === "complete") assert.deepEqual(result.bytes, f.artifact);
    assert.equal((await client.retrieve()).status, "complete");
    assert.deepEqual(approvals, ["preparation", "retrieval"]);
    assert.equal(signatures, 2);
    assert.equal(f.paidRequests.length, 2);
    assert.deepEqual(JSON.parse(f.paidRequests[0].body), f.request);
    assert.deepEqual(JSON.parse(f.paidRequests[1].body), { retrievalToken: token });
    assert.notEqual(f.paidRequests[0].proof, f.paidRequests[1].proof);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a changed fixed fee is rejected before any wallet signature", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aomi-two-stage-"));
  try {
    const f = fixture("300", "preparation_amount");
    let signatures = 0;
    const client = new TwoStageTaskClient({ endpoint, chainId, payer, merchant, stateDirectory: directory,
      trustedJwks: f.trustedJwks, maxRetrievalMicrousd: 500n, fetch: f.mockFetch, now: () => now,
      approve: () => true, signTypedData: async () => { signatures++; return `0x${"a".repeat(130)}`; } });
    await assert.rejects(client.prepare(f.request), /amount exceeds|reviewed stage cap/);
    assert.equal(signatures, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an attested preview mismatch blocks retrieval", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aomi-two-stage-"));
  try {
    const f = fixture("300", "preview_hash");
    const client = new TwoStageTaskClient({ endpoint, chainId, payer, merchant, stateDirectory: directory,
      trustedJwks: f.trustedJwks, maxRetrievalMicrousd: 500n, fetch: f.mockFetch, now: () => now,
      approve: () => true, signTypedData: async () => `0x${"a".repeat(130)}` });
    await client.prepare(f.request);
    await assert.rejects(client.status(), /attestation/);
    assert.equal(f.paidRequests.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an ambiguous preparation response reuses the persisted signature", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aomi-two-stage-"));
  try {
    const f = fixture();
    let failOnce = true;
    let signatures = 0;
    const flakyFetch: typeof fetch = async (input, init) => {
      if (String(input) === endpoint && new Headers(init?.headers).has("payment-signature") && failOnce) {
        failOnce = false;
        throw new Error("response lost after payment submission");
      }
      return f.mockFetch(input, init);
    };
    const options = { endpoint, chainId, payer, merchant, stateDirectory: directory,
      trustedJwks: f.trustedJwks, maxRetrievalMicrousd: 500n, fetch: flakyFetch, now: () => now,
      approve: () => true, signTypedData: async () => { signatures++; return `0x${"a".repeat(130)}`; } };
    await assert.rejects(new TwoStageTaskClient(options).prepare(f.request), /response lost/);
    const saved = JSON.parse(await readFile(path.join(directory, "two-stage.json"), "utf8"));
    assert.equal(signatures, 1);
    assert.equal(saved.preparation.proof.length > 100, true);
    assert.deepEqual(await new TwoStageTaskClient(options).prepare(f.request), { status: "prepared", quoteId });
    assert.equal(signatures, 1);
    assert.equal(f.paidRequests[0].proof, saved.preparation.proof);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Mainnet may buy retrieval while the preparation batch is pending, but withholds completion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aomi-two-stage-"));
  try {
    const f = fixture("300", undefined, 5042);
    const approvals: string[] = [];
    const client = new TwoStageTaskClient({ endpoint, chainId: 5042, payer, merchant, stateDirectory: directory,
      trustedJwks: f.trustedJwks, maxRetrievalMicrousd: 300n, fetch: f.mockFetch, now: () => now,
      rpcUrl: "https://rpc.mainnet.arc.io",
      gatewayFetch: async () => new Response(JSON.stringify({ transfers: [] }), { status: 200 }),
      approve: ({ stage }) => { approvals.push(stage); return true; },
      signTypedData: async () => `0x${"a".repeat(130)}` });
    await client.prepare(f.request);
    assert.equal((await client.status()).status, "ready");
    assert.deepEqual(await client.retrieve(), { status: "pending" });
    assert.deepEqual(approvals, ["preparation", "retrieval"]);
    const saved = JSON.parse(await readFile(path.join(directory, "two-stage.json"), "utf8"));
    assert.equal(saved.retrieval.receipt.transaction, "retrieval-transfer");
    assert.equal(Buffer.from(saved.artifact, "base64").equals(f.artifact), true);
    assert.deepEqual(await client.retrieve(), { status: "pending" });
    assert.deepEqual(approvals, ["preparation", "retrieval"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
