import type { Metadata } from "next";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";

export const metadata: Metadata = { title: "Builder Reference" };

const rows = [
  ["Already have an agent?", "packages/task-client + packages/circle-arc-wallet"],
  ["Need an agent?", "templates/invoice-agent + apps/invoice-dashboard"],
  ["Custom product APIs", "Implement tools in the Aomi App; replace the invoice fixture client"],
  ["Wallet authority", "Circle Agent Wallet retains signing authority and shows explicit review"],
  ["Aomi’s role", "Agent runtime and controlled execution orchestration—not custodian or counterparty"],
  ["Success boundary", "Circle confirmation plus independent Arc receipt verification"],
];

export default function Reference() {
  return <><section className="page-hero"><div className="container"><p className="eyebrow">Builder reference</p><h1>Choose the smallest<br />integration surface.</h1><p className="lede">This site explains the Tameion-specific products. Canonical build and Agent API behavior stays in Aomi’s maintained documentation.</p></div></section><section className="section"><div className="container"><div className="facts">{rows.map(([a,b]) => <div className="fact" key={a}><strong>{a}</strong><span>{b}</span></div>)}</div><div className="actions"><ExternalLink className="button primary" href={links.buildDocs}>Build an Aomi App ↗</ExternalLink><ExternalLink className="button" href={links.agentDocs}>Integrate the Agent API ↗</ExternalLink><ExternalLink className="button" href={links.github}>Browse source ↗</ExternalLink></div></div></section></>;
}
