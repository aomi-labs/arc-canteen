import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { ExecutionSequence } from "@/components/how-it-works";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";
import "./execution-kit.css";

export const metadata: Metadata = { title: "Aomi × Circle Execution Kit" };

const integration = `// server/execution.ts
import { TwoStageTaskClient } from "arc-canteen/task-client/two-stage";
import { fetchTrustedTaskJwks } from "arc-canteen/task-client";
import { CircleArcWallet } from "arc-canteen/circle-arc-wallet";

const endpoint = "https://api-staging.aomi.dev/v1/task/build";
const wallet = new CircleArcWallet({ walletAddress: circleWalletAddress });
const payer = await wallet.gatewayPayer(5042); // Arc Mainnet
const request = {
  intent: decision.summary,
  chainId: 5042,
  sender: payer,
  payer,
  constraints: decision.constraints,
};
const client = new TwoStageTaskClient({
  endpoint,
  chainId: 5042,
  payer,
  merchant: independentlyVerifiedAomiSeller,
  trustedJwks: await fetchTrustedTaskJwks(endpoint),
  maxRetrievalMicrousd: decision.maximumServiceFeeMicrousd,
  stateDirectory: "/private/task-state/invoice-1042",
  rpcUrl: "https://rpc.mainnet.arc.io",
  approve: (payment) => showEachServicePaymentReview(payment),
  signTypedData: (data) => wallet.signTypedData(data, showExactSignatureReview),
});

let prepared = await client.prepare(request); // 0.01 USDC preparation.
while (prepared.status === "pending") {
  await wait(2_000); // Reuse the same journal and signed proof.
  prepared = await client.prepare(request);
}
let preview = await client.status(); // Free polling.
while (preview.status === "pending") {
  await wait(2_000);
  preview = await client.status();
}
if (preview.status !== "ready") throw new Error("Task preparation failed");

let result = await client.retrieve(); // Separate review/payment for nonzero outflow.
while (result.status === "pending") {
  await wait(5_000); // Gateway batch settlement can outlive the preview quote.
  result = await client.retrieve();
}
const artifact = JSON.parse(result.bytes.toString("utf8"));
reviewBusinessTransactionSeparately(artifact); // No Task transaction is broadcast here.`;

export default function ExecutionKit() {
  return (
    <>
      <section className="compact-hero"><div className="container compact-hero-grid">
        <div><p className="eyebrow">01 · Execution Kit</p><h1>Buy a simulated Arc plan in two reviewed steps.</h1><p className="lede">Aomi prepares a bounded Task and sells its frozen result separately. Circle signs each service payment; any business transaction stays under your own review.</p></div>
        <dl className="status-panel"><div><dt>Runtime</dt><dd>Staging API live</dd></div><div><dt>Payment</dt><dd>Two Arc Mainnet purchases verified</dd></div><div><dt>Network</dt><dd>Arc Mainnet · chain 5042</dd></div><div><dt>Production</dt><dd>Older contract still live</dd></div></dl>
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>01</span><div><p className="eyebrow">Use this when</p><h2>You already own the intelligence.</h2></div></header>
        <div className="facts"><div className="fact"><strong>Your system owns</strong><span>The intent, constraints, payment reviews, and final transaction decision.</span></div><div className="fact"><strong>Aomi owns</strong><span>Bounded preparation, a private job, an attested preview, and frozen result bytes.</span></div><div className="fact"><strong>Circle owns</strong><span>Two separate Gateway payment authorizations and their transfer records.</span></div><div className="fact"><strong>Your verifier owns</strong><span>Attestation, byte equality, Arc batch confirmation, and later execution review.</span></div></div>
      </div></section>

      <section className="runbook-section proof-runbook"><div className="container section-grid">
        <header className="section-index"><span>02</span><div><p className="eyebrow">Copy the integration</p><h2>Integrate against the staging contract.</h2></div></header>
        <div><CodeBlock label="STAGING CLIENT · PINNED SOURCE">{"npm install github:aomi-labs/arc-canteen#7b3a3ce00280f185074bbc2380455edb8f4833ce"}</CodeBlock><CodeBlock label="SERVER-SIDE NODE · ARC MAINNET STAGING">{integration}</CodeBlock><p className="inline-note"><strong>Network scope:</strong> the public staging API accepts Arc Mainnet USDC, and a direct two-stage paid client run has settled onchain. This sample stops at the simulated artifact; the existing execution adapter still uses the retired TaskAuthorization contract. Production and venue-routed purchases are not verified. Use a private durable journal, independently verify the seller address, and review any final wallet transaction separately.</p><div className="actions compact-actions"><ExternalLink className="button primary" href={links.taskClient}>Open two-stage client source ↗</ExternalLink></div></div>
      </div></section>

      <section className="runbook-section execution-sequence-section"><div className="container">
        <header className="section-index"><span>03</span><div><p className="eyebrow">Trace the request</p><h2>From agent intent to a settled result.</h2></div></header>
        <ExecutionSequence />
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>04</span><div><p className="eyebrow">Implementation reference</p><h2>Five gates before result delivery.</h2></div></header>
        <div className="instruction-list"><div className="instruction"><b>01</b><div><strong>Bind the Task request</strong><p>Submit the intent, Arc chain, payer, and constraints. Check the unpaid preparation challenge against the exact canonical body.</p></div><span>Free request</span></div><div className="instruction"><b>02</b><div><strong>Buy preparation</strong><p>Review and sign the fixed 0.01 USDC Gateway charge. Persist and reuse the original proof on uncertain responses.</p></div><span>Payment 1</span></div><div className="instruction"><b>03</b><div><strong>Inspect the preview</strong><p>Poll the private job for free. Verify its attestation, frozen payload hash, and separately measured retrieval fee.</p></div><span>Free polling</span></div><div className="instruction"><b>04</b><div><strong>Buy the frozen result</strong><p>Review the second fee, sign a distinct Gateway authorization, and retain the exact proof for recovery.</p></div><span>Payment 2</span></div><div className="instruction"><b>05</b><div><strong>Verify before execution</strong><p>Match the delivered bytes to the attestation and both payment records to Circle and Arc. Review any business transaction separately.</p></div><span>No auto-execution</span></div></div>
      </div></section>
    </>
  );
}
