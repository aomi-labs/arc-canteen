import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { ExecutionSequence } from "@/components/how-it-works";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";
import "./execution-kit.css";

export const metadata: Metadata = { title: "Aomi × Circle Execution Kit" };

const integration = `// server/execution.ts
import { ArcExecutionKit } from "@arc-canteen/task-client";
import { CircleArcWallet } from "@arc-canteen/circle-arc-wallet";
import { executionConfig, requireApproval } from "./execution-config";

const wallet = new CircleArcWallet({
  walletAddress: process.env.CIRCLE_WALLET_ADDRESS!,
});

const kit = ArcExecutionKit.arcTestnet({
  ...executionConfig,
  wallet,
});

const quote = await kit.prepare({
  intent: agentDecision,
  reference: "INV-1042",
  sender: wallet.walletAddress,
  recipient: "0x1111111111111111111111111111111111111111",
  amountUsdc: "1",
});

// Approval 1: purchase the immutable Aomi service plan.
const artifact = await quote.purchase(requireApproval);
if ("status" in artifact) {
  throw new Error("Purchase is pending reconciliation");
}

// Approval 2: review and sign the exact Circle transfer.
const result = await artifact.execute(requireApproval);

// This receipt has already been independently verified on Arc.
await markComplete(result.receipt.transactionHash);`;

export default function ExecutionKit() {
  return (
    <>
      <section className="compact-hero"><div className="container compact-hero-grid">
        <div><p className="eyebrow">01 · Execution Kit</p><h1>Connect your agent to controlled Arc execution.</h1><p className="lede">Your agent decides what it wants. The kit verifies the Task response, requests explicit Circle Wallet review, and proves the Arc transaction landed.</p></div>
        <dl className="status-panel"><div><dt>Status</dt><dd>Preview</dd></div><div><dt>Network</dt><dd>Arc Testnet only</dd></div><div><dt>Action</dt><dd>One USDC transfer</dd></div><div><dt>Hosted endpoint</dt><dd>Pending</dd></div></dl>
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>01</span><div><p className="eyebrow">Use this when</p><h2>You already own the intelligence.</h2></div></header>
        <div className="facts"><div className="fact"><strong>Your system owns</strong><span>The decision, product context, policy, and user experience.</span></div><div className="fact"><strong>Aomi owns</strong><span>The immutable Task plan, attestation, constraints, and service purchase record.</span></div><div className="fact"><strong>Circle owns</strong><span>Wallet authority, explicit transfer review, signing, and submission.</span></div><div className="fact"><strong>Your verifier owns</strong><span>Independent Arc receipt validation before product state changes.</span></div></div>
      </div></section>

      <section className="runbook-section proof-runbook"><div className="container section-grid">
        <header className="section-index"><span>02</span><div><p className="eyebrow">Copy the integration</p><h2>Integrate against the tested contract.</h2></div></header>
        <div><CodeBlock label="SERVER-SIDE NODE · CORE FLOW">{integration}</CodeBlock><p className="inline-note"><strong>Preview:</strong> keep the trusted endpoint, identity, seller, JWKS, fee cap, state directory, and Arc RPC in server-side <code>executionConfig</code>. Use only values from an Aomi deployment you independently trust.</p><div className="actions compact-actions"><ExternalLink className="button primary" href={links.taskClient}>Open full implementation ↗</ExternalLink></div></div>
      </div></section>

      <section className="runbook-section execution-sequence-section"><div className="container">
        <header className="section-index"><span>03</span><div><p className="eyebrow">Trace the request</p><h2>From agent intent to verified Arc receipt.</h2></div></header>
        <ExecutionSequence />
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>04</span><div><p className="eyebrow">Implementation reference</p><h2>Five gates before completion.</h2></div></header>
        <div className="instruction-list"><div className="instruction"><b>01</b><div><strong>Submit the bounded intent</strong><p>Send the exact action and constraints to <code>POST /v1/task/build</code>.</p></div><span>Output: Task quote</span></div><div className="instruction"><b>02</b><div><strong>Verify the Task</strong><p>Check the attestation, payload hash, identities, chain, fee cap, and Gateway.</p></div><span>Fail closed</span></div><div className="instruction"><b>03</b><div><strong>Approve the service purchase</strong><p>Show the immutable Aomi plan before purchasing it.</p></div><span>Approval 1</span></div><div className="instruction"><b>04</b><div><strong>Review the transfer</strong><p>Allow one simulated native-USDC transfer matching the original constraints.</p></div><span>Approval 2</span></div><div className="instruction"><b>05</b><div><strong>Verify settlement</strong><p>Require Circle confirmation and an independently checked Arc receipt.</p></div><span>Then mark complete</span></div></div>
      </div></section>
    </>
  );
}
