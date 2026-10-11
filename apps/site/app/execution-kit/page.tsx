import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { ExecutionSequence } from "@/components/how-it-works";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";
import "./execution-kit.css";

export const metadata: Metadata = { title: "Aomi × Circle Execution Kit" };

const integration = `// server/execution.ts
import { readFile } from "node:fs/promises";
import { TaskClient, parseSmartAccountArtifact } from "arc-canteen/task-client";
import { CircleArcWallet } from "arc-canteen/circle-arc-wallet";

const wallet = new CircleArcWallet({ walletAddress: circleWallet });
const payer = await wallet.gatewayPayer();
const calls = planCalls(decision); // exact ordered { to, data, value }[]

const request = {
  executionKind: "smart_account_calls",
  intent: decision.summary,
  chainId: 5042002,
  sender: wallet.walletAddress,
  payer,
  calls,
  constraints: decision.constraints,
};

const client = new TaskClient({
  endpoint: process.env.AOMI_TASK_ENDPOINT!,
  recipient: process.env.AOMI_TASK_SELLER!,
  trustedJwks: JSON.parse(await readFile("./trusted-aomi-jwks.json", "utf8")),
  maxFeeMicrousd: 1_100_000n,
  stateDirectory: "/private/task-state",
  payer,
  signTypedData: (data) => wallet.signTypedData(data, showReview),
});

// Signature 1: authorize only this exact Task request.
const quote = await client.prepare(request);

// Signature 2: pay for the immutable simulated artifact.
const purchased = await client.purchase(request);
if (purchased.status === "pending") return reconcileLater();

const artifact = parseSmartAccountArtifact(purchased.bytes, request, quote);
assertExactCalls(artifact.calls, calls);

// Signature 3: Circle executes the exact verified calls on Arc.
for (const call of artifact.calls) {
  const submitted = await wallet.executeContractCall(call, showReview);
  await verifyArcReceipt(submitted);
}`;

export default function ExecutionKit() {
  return (
    <>
      <section className="compact-hero"><div className="container compact-hero-grid">
        <div><p className="eyebrow">01 · Execution Kit</p><h1>Turn agent decisions into verified Arc execution.</h1><p className="lede">Aomi turns an exact wallet request into a paid, simulated artifact. Circle separately authorizes the request, the service payment, and final execution.</p></div>
        <dl className="status-panel"><div><dt>Runtime</dt><dd>Staging verified</dd></div><div><dt>Hosted route</dt><dd>Being routed</dd></div><div><dt>Network</dt><dd>Arc Testnet proven</dd></div><div><dt>Production</dt><dd>Rollout pending</dd></div></dl>
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>01</span><div><p className="eyebrow">Use this when</p><h2>You already own the intelligence.</h2></div></header>
        <div className="facts"><div className="fact"><strong>Your system owns</strong><span>The decision, product policy, and exact ordered contract calls.</span></div><div className="fact"><strong>Aomi owns</strong><span>Independent simulation, the request-bound artifact, quote recovery, and attestation.</span></div><div className="fact"><strong>Circle owns</strong><span>Wallet authority and three separate signatures: Task, Gateway payment, and final execution.</span></div><div className="fact"><strong>Your verifier owns</strong><span>Byte equality and Arc receipt/event checks before product state changes.</span></div></div>
      </div></section>

      <section className="runbook-section proof-runbook"><div className="container section-grid">
        <header className="section-index"><span>02</span><div><p className="eyebrow">Copy the integration</p><h2>Integrate against the tested contract.</h2></div></header>
        <div><CodeBlock label="INSTALL · IMMUTABLE HTTPS SOURCE">{"npm install https://github.com/aomi-labs/arc-canteen/archive/71e08b4f3e18b1b4dd0a5b7d3845b57165e48390.tar.gz"}</CodeBlock><CodeBlock label="SERVER-SIDE NODE · SMART ACCOUNT FLOW">{integration}</CodeBlock><p className="inline-note"><strong>Provisioning:</strong> ask Aomi for the routed staging endpoint, seller address, and trusted attestation JWKS. The signature-only runtime and <code>smart_account_calls</code> flow are verified on Arc Testnet; the canonical builder route and production Task rollout are still being completed. Final wallet execution always stays with the builder.</p><div className="actions compact-actions"><ExternalLink className="button primary" href={links.taskClient}>Open full implementation ↗</ExternalLink></div></div>
      </div></section>

      <section className="runbook-section execution-sequence-section"><div className="container">
        <header className="section-index"><span>03</span><div><p className="eyebrow">Trace the request</p><h2>From agent intent to verified Arc receipt.</h2></div></header>
        <ExecutionSequence />
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>04</span><div><p className="eyebrow">Implementation reference</p><h2>Five gates before completion.</h2></div></header>
        <div className="instruction-list"><div className="instruction"><b>01</b><div><strong>Authorize the exact Task</strong><p>Sign the canonical request with short-lived EIP-712 authorization. No login, session, API key, or bearer.</p></div><span>Signature 1</span></div><div className="instruction"><b>02</b><div><strong>Verify the 402 quote</strong><p>Check the attestation, request and payload hashes, identities, chain, fee cap, and Gateway requirement.</p></div><span>Fail closed</span></div><div className="instruction"><b>03</b><div><strong>Purchase the artifact</strong><p>Sign the separate Gateway payment; durable idempotency makes retries recover the same purchase.</p></div><span>Signature 2</span></div><div className="instruction"><b>04</b><div><strong>Compare exact call bytes</strong><p>Require the artifact’s ordered targets, calldata, and values to equal the application plan.</p></div><span>Before execution</span></div><div className="instruction"><b>05</b><div><strong>Execute and verify</strong><p>Circle signs the final calls. Mark complete only after the Arc receipt and expected contract events verify.</p></div><span>Signature 3</span></div></div>
      </div></section>
    </>
  );
}
