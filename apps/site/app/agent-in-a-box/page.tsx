import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";

export const metadata: Metadata = { title: "Arc Agent-in-a-Box" };

const embed = `import { Aomi } from "@aomi-labs/client";

const aomi = new Aomi({ baseUrl: "https://chat.aomi.dev" });

const run = aomi.agent.run(prompt, {
  target: { mode: "direct", applicationId: 2938640 },
});`;

export default function AgentInABox() {
  return (
    <>
      <section className="compact-hero">
        <div className="container compact-hero-grid">
          <div><p className="eyebrow blue-text">02 · Agent-in-a-Box</p><h1>Build the agent your Arc app needs.</h1><p className="lede">Connect your product APIs to a hosted Aomi App, embed it in your interface, and keep Circle signing under explicit wallet control.</p></div>
          <dl className="status-panel"><div><dt>Status</dt><dd><i /> Live starter</dd></div><div><dt>Application</dt><dd>2938640</dd></div><div><dt>Test cases</dt><dd>3 invoices</dd></div><div><dt>Settlement</dt><dd>Builder-owned</dd></div></dl>
        </div>
      </section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>01</span><div><p className="eyebrow">Prepare</p><h2>Give the agent your domain operations.</h2></div></header>
        <div><CodeBlock label="REPOSITORY">{"git clone https://github.com/aomi-labs/arc-canteen\ncd arc-canteen/templates/invoice-agent"}</CodeBlock><div className="facts compact-facts"><div className="fact"><strong>Change</strong><span><code>src/client.rs</code> — call your real APIs.</span></div><div className="fact"><strong>Keep</strong><span><code>src/tool.rs</code> — deterministic approval and refusal rules.</span></div><div className="fact"><strong>Configure</strong><span><code>INVOICE_API_BASE_URL</code> — your HTTPS service.</span></div><div className="fact"><strong>Verify</strong><span><code>cargo test</code> — approved and refusal cases.</span></div></div></div>
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>02</span><div><p className="eyebrow">Deploy</p><h2>Use the existing Aomi Build lifecycle.</h2></div></header>
        <div className="instruction-list"><div className="instruction"><b>01</b><div><strong>Connect the repository</strong><p>Open Aomi Build and select the included <code>aomi.toml</code>.</p></div><ExternalLink href={links.build}>Open Build ↗</ExternalLink></div><div className="instruction"><b>02</b><div><strong>Add the API base URL</strong><p>Set the one required secret to an HTTPS API implementing your tools.</p></div><span>INVOICE_API_BASE_URL</span></div><div className="instruction"><b>03</b><div><strong>Build and activate</strong><p>The activation result gives your frontend an Application ID.</p></div><span>Output: applicationId</span></div></div>
      </div></section>

      <section className="runbook-section"><div className="container section-grid">
        <header className="section-index"><span>03</span><div><p className="eyebrow">Embed</p><h2>Call the hosted agent from your product.</h2></div></header>
        <div><CodeBlock label="FRONTEND">{embed}</CodeBlock><p className="inline-note"><strong>Boundary:</strong> the agent may read, reason, and prepare. Your authenticated backend owns Circle wallet review and signing.</p></div>
      </div></section>

      <section className="runbook-section proof-runbook"><div className="container section-grid">
        <header className="section-index"><span>04</span><div><p className="eyebrow">Verify</p><h2>Exercise the live acceptance cases.</h2></div></header>
        <div className="instruction-list"><div className="instruction"><b>✓</b><div><strong>Pay invoice INV-1042</strong><p>Expected: prepare one USDC payment for wallet review.</p></div><span>ALLOW</span></div><div className="instruction"><b>×</b><div><strong>Pay invoice INV-1043</strong><p>Expected: refuse because the vendor address changed.</p></div><span>REFUSE</span></div><div className="instruction"><b>×</b><div><strong>Pay invoice INV-1044</strong><p>Expected: refuse because payment is already confirmed.</p></div><span>REFUSE</span></div><div className="actions compact-actions"><ExternalLink className="button primary" href={links.invoiceDashboardLive}>Run live proof ↗</ExternalLink><ExternalLink className="button" href={links.invoiceAgent}>Open template source ↗</ExternalLink><Link className="button" href="/examples/invoice-dashboard">Dashboard integration</Link></div></div>
      </div></section>
    </>
  );
}
