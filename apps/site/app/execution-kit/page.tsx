import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, links } from "@/components/site-shell";

export const metadata: Metadata = { title: "Aomi × Circle Execution Kit" };

export default function ExecutionKit() {
  return <>
    <section className="page-hero"><div className="container"><p className="eyebrow">Item 1 · bring your own intelligence</p><h1>Aomi × Circle<br />Execution Kit</h1><p className="lede">A narrow client for agents that already know what they want to do: validate the Aomi Task API response, request a reviewed Circle Wallet signature, recover safely, and prove the Arc transaction landed.</p><div className="status-banner"><strong>Preview — hosted Task endpoint pending.</strong> The open client and wallet adapter are implemented, but this is not advertised as a live hosted product yet.</div></div></section>
    <section className="section"><div className="container content-grid"><div><p className="eyebrow">The contract</p><h2>Your agent decides. This kit controls execution.</h2></div><div><div className="diagram"><span>Your agent</span><b>→</b><span>Aomi Task API</span><b>→</b><span>Circle Agent Wallet</span></div><div className="steps"><div className="step"><strong>1. Submit intent</strong>Send the action and context to <code>POST /v1/task/build</code>.</div><div className="step"><strong>2. Verify the task</strong>Check Aomi’s Ed25519 attestation, payload hash, seller, payer, chain, fee cap, and exact Gateway contract.</div><div className="step"><strong>3. Review and sign</strong>Show the Circle Wallet operation before signing. No shell interpolation and no silent transfer.</div><div className="step"><strong>4. Recover without double-paying</strong>Persist the authorization and idempotency state, then reuse it through recovery.</div><div className="step"><strong>5. Verify independently</strong>Wait for Circle confirmation and verify the transaction receipt against Arc RPC.</div></div></div></div></section>
    <section className="section demo-strip"><div className="container demo-grid"><div><p className="eyebrow">Use it now</p><h2>Inspect the client while the hosted seam comes online.</h2></div><div><p>The package lives in this monorepo at <code>packages/task-client</code>, paired with <code>packages/circle-arc-wallet</code>.</p><ExternalLink className="button light" href={links.github}>Open source ↗</ExternalLink> <Link className="button light" href="/proof/pay-the-right-invoice">See the proof</Link></div></div></section>
  </>;
}
