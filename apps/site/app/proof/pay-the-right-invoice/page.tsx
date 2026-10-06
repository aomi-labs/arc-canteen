import type { Metadata } from "next";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";

export const metadata: Metadata = { title: "Pay the Right Invoice" };

const cases = [
  { id: "INV-1042", state: "Approved", result: "Prepare payment", detail: "One native USDC on Arc Testnet. The fixture allows preparation; live execution still requires wallet review and receipt proof.", cls: "pass" },
  { id: "INV-1043", state: "Vendor address changed", result: "Refuse", detail: "The current wallet no longer matches the approved snapshot. The agent stops before wallet review.", cls: "refuse" },
  { id: "INV-1044", state: "Already paid", result: "Refuse", detail: "The payment status API reports completion. The agent refuses a duplicate action.", cls: "refuse" },
];

export default function Proof() {
  return <>
    <section className="page-hero"><div className="container"><p className="eyebrow">Shared product proof</p><h1>Pay the right invoice.<br />Refuse the wrong one.</h1><p className="lede">A concrete Tameion workflow that shows where custom app data, agent reasoning, wallet review, and Arc settlement each belong.</p><div className="status-banner"><strong>The hosted agent proof is live; settlement is not.</strong> Application 2938640 runs all three decisions against the public fixture API. A settlement success badge still requires Circle confirmation and independent Arc receipt verification.</div></div></section>
    <section className="section proof-section"><div className="container"><p className="eyebrow">Decision cases</p><h2>One happy path. Two deliberate refusals.</h2><div className="proof-grid">{cases.map(item => <article className={`proof-card ${item.cls}`} key={item.id}><span className="label">{item.id} · {item.state}</span><h3>{item.result}</h3><p>{item.detail}</p></article>)}</div><div className="facts"><div className="fact"><strong>Agent-in-a-Box proves</strong><span>The hosted agent calls application-specific APIs, compares current state with approved state, and produces a bounded action or refusal through the embedded Agent API accessor.</span></div><div className="fact"><strong>Execution Kit proves</strong><span>The client can validate task metadata, request an explicit Circle review, preserve idempotency, and verify the Arc receipt in contract tests.</span></div><div className="fact"><strong>Still unverified</strong><span>Hosted Task endpoint availability, funded Circle Agent Wallet execution, a real Arc Testnet receipt, and a non-author replay.</span></div></div></div></section>
    <section className="section demo-strip"><div className="container demo-grid"><div><p className="eyebrow">Run it</p><h2>The executable proof lives with the product code.</h2></div><div><p>Open the live dashboard to run the hosted agent through all three decisions. Enable execution only with an authenticated Circle CLI and Arc RPC.</p><ExternalLink className="button light" href={links.invoiceDashboardLive}>Run hosted agent ↗</ExternalLink> <ExternalLink className="button light" href={links.github}>Open repository ↗</ExternalLink></div></div></section>
  </>;
}
