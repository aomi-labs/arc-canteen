import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { AgentDemoActions } from "@/components/agent-demo-actions";
import { InvoiceAgentWidget } from "@/components/invoice-agent-widget";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";

export const metadata: Metadata = { title: "Arc Agent-in-a-Box" };

const embed = `import { AomiWidget } from "@aomi-labs/widget-lib";
import "@aomi-labs/widget-lib/styles.css";

<AomiWidget
  applicationId="2938640"
  apiUrl="https://chat.aomi.dev"
  auth={{ kind: "browser_wallet" }}
  routing={{
    targets: [{ mode: "direct", apps: [{ applicationId: 2938640 }] }],
    defaultMode: "direct",
  }}
/>`;

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
        <header className="section-index"><span>03</span><div><p className="eyebrow">Embed</p><h2>Mount the hosted agent in your product.</h2></div></header>
        <div><CodeBlock label="FRONTEND">{embed}</CodeBlock><p className="inline-note"><strong>Boundary:</strong> the agent may read, reason, and prepare. Your authenticated backend owns Circle wallet review and signing.</p></div>
      </div></section>

      <section className="runbook-section live-agent-section" id="watch-live"><div className="container section-grid">
        <header className="section-index"><span>04</span><div><p className="eyebrow blue-text">Live · Application 2938640</p><h2>Watch it live.</h2><p className="live-agent-note">This invoice agent was built from the original Tameion RFB in one shot with agentic support. Ask it to pay <code>INV-1042</code>, <code>INV-1043</code>, or <code>INV-1044</code>.</p><AgentDemoActions sourceUrl={links.invoiceAgent} /></div></header>
        <div><InvoiceAgentWidget /><div className="live-prompts" aria-label="Invoice prompts to try"><span>Try</span><code>Pay invoice INV-1042 if it is still safe.</code><code>Pay invoice INV-1043.</code><code>Pay invoice INV-1044.</code></div></div>
      </div></section>

      <section className="runbook-section rfb-section"><div className="container section-grid">
        <header className="section-index"><span>05</span><div><p className="eyebrow">Source challenge</p><h2>The task we built from.</h2></div></header>
        <details className="rfb-disclosure">
          <summary><span><b>Tameion RFB 02</b>AP/AR Automation Agent</span><em>Expand original task</em></summary>
          <div className="rfb-content">
            <p className="rfb-kicker">Invoices are still read by hand, and paid at whatever moment someone gets to them.</p>
            <p><strong>The problem.</strong> AP/AR teams still process invoices, decide payment timing, and chase collections manually. The RFB asks builders to automate that cycle, reduce error and fraud, and improve cash flow.</p>
            <div className="rfb-columns"><div><h3>What the AI decides</h3><ul><li>Read invoices, emails, and contracts to determine what is owed.</li><li>Optimize vendor payment timing against preserving cash.</li><li>Detect duplicate invoices and probable fraud.</li><li>Screen a vendor wallet before paying it.</li><li>Match payments to invoices automatically.</li></ul></div><div><h3>What builders create</h3><ul><li>Invoice ingestion from email, PDF, or API.</li><li>Payment-timing optimization engines.</li><li>Payment workflows with address screening.</li><li>Receivables collection timed to the customer.</li></ul></div></div>
            <p className="rfb-built"><strong>What we built:</strong> a hosted invoice agent that checks vendor approval, detects a changed payout address, refuses duplicates, and prepares an Arc USDC payment for explicit Circle Wallet review.</p>
            <ExternalLink className="button" href={`${links.tameion}#rfbs`}>Read the original Tameion RFB ↗</ExternalLink>
          </div>
        </details>
      </div></section>
    </>
  );
}
