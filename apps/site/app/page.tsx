import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { HowItWorks } from "@/components/how-it-works";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";
import styles from "./home.module.css";

const paths = [
  { have: "An agent or decision engine", use: "Aomi × Circle Execution Kit", action: "Connect the Task API client", status: "Testnet proven", href: "/execution-kit", tone: "orange" },
  { have: "Product APIs, but no agent", use: "Arc Agent-in-a-Box", action: "Deploy the invoice starter", status: "Live", href: "/agent-in-a-box", tone: "blue" },
];

export default function Home() {
  return (
    <>
      <section className="runbook-hero" id="start">
        <div className="container runbook-hero-grid">
          <div>
            <p className="eyebrow">Tameion builder kit · Aomi × Arc</p>
            <h1 className={styles.heroTitle}>Ship an Arc finance agent in 10 minutes.</h1>
            <p className="lede">Bring your product API. Aomi hosts the agent, calls your tools, and prepares reviewed actions for your Circle wallet.</p>
            <div className="actions"><Link className="button primary" href="/agent-in-a-box#watch-live">Watch the invoice agent live →</Link><Link className="button" href="#choose">Choose your path ↓</Link></div>
          </div>
          <aside className="quickstart" aria-label="Quick start">
            <div className="quickstart-head"><span>START HERE</span><span className="live-dot">LIVE</span></div>
            <CodeBlock label="Clone the builder kit">{"git clone https://github.com/aomi-labs/arc-canteen\ncd arc-canteen\npnpm install"}</CodeBlock>
            <dl className="meta-grid"><div><dt>Application</dt><dd>2938640</dd></div><div><dt>Network</dt><dd>Arc Testnet</dd></div><div><dt>Try</dt><dd>Pay INV-1042</dd></div><div><dt>Result</dt><dd>Wallet review</dd></div></dl>
          </aside>
        </div>
      </section>

      <section className="runbook-section" id="choose">
        <div className="container section-grid">
          <header className={`section-index ${styles.sectionTitle}`}><span>01</span><div><p className="eyebrow">Choose a path</p><h2>Do you already have an agent or decision engine?</h2></div></header>
          <div className="path-table">
            <div className="path-head"><span>You already have</span><span>Use</span><span>First action</span><span>Status</span></div>
            {paths.map((path) => <Link className={`path-row ${path.tone}`} href={path.href} key={path.use}><span>{path.have}</span><strong>{path.use}</strong><span>{path.action} →</span><b>{path.status}</b></Link>)}
          </div>
        </div>
      </section>

      <section className="runbook-section" id="execution">
        <div className="container section-grid">
          <header className={`section-index ${styles.sectionTitle}`}><span>02</span><div><p className="eyebrow">Execution Kit · Arc Testnet proven</p><h2>Bring your agent. Buy a verified execution artifact on Arc.</h2><HowItWorks diagram="execution" /></div></header>
          <div className="instruction-list">
            <div className="instruction"><b>01</b><div><strong>Sign the exact Task request</strong><p>Your wallet authorizes one canonical request—without an Aomi login, session, API key, or bearer.</p></div><span>Input: agent decision</span></div>
            <div className="instruction"><b>02</b><div><strong>Buy the simulated artifact</strong><p>Aomi returns a request-bound 402 quote; a separate Gateway signature purchases the immutable result.</p></div><span>Recoverable purchase</span></div>
            <div className="instruction"><b>03</b><div><strong>Compare before signing</strong><p>Your application verifies the exact ordered contract calls before Circle signs execution.</p></div><span>Fail closed</span></div>
            <div className="instruction"><b>04</b><div><strong>Confirm the Arc receipt</strong><p>Your app marks work complete only after independent receipt and contract-event verification.</p></div><Link href="/execution-kit">Open full brief →</Link></div>
          </div>
        </div>
      </section>

      <section className="runbook-section" id="agent">
        <div className="container section-grid">
          <header className={`section-index ${styles.sectionTitle}`}><span>03</span><div><p className="eyebrow blue-text">Agent-in-a-Box · live</p><h2>No agent yet? Your app needs an agentic workflow. Turn your API into automation.</h2><HowItWorks diagram="agent" /></div></header>
          <div className="instruction-list">
            <div className="instruction"><b>01</b><div><strong>Expose your product API</strong><p>Implement the domain operations the agent needs, such as <code>get_invoice</code>, <code>get_vendor</code>, and <code>check_payment_status</code>.</p></div><span>Input: HTTPS API</span></div>
            <div className="instruction"><b>02</b><div><strong>Replace the fixture client</strong><p>Edit <code>templates/invoice-agent/src/client.rs</code> and keep deterministic money checks in code.</p></div><span>Output: typed tools</span></div>
            <div className="instruction"><b>03</b><div><strong>Deploy with Aomi Build</strong><p>Connect this repository, set <code>INVOICE_API_BASE_URL</code>, and activate the Aomi App.</p></div><span>Output: Application ID</span></div>
            <div className="instruction"><b>04</b><div><strong>Embed it in your UI</strong><p>Mount <code>@aomi-labs/widget-lib</code>, lock Direct routing to the Application ID, and keep signing behind your authenticated wallet backend.</p></div><Link href="/agent-in-a-box">Open full recipe →</Link></div>
          </div>
        </div>
      </section>

      <section className="agent-handoff" id="agent-prompt">
        <div className="container section-grid">
          <header className={`section-index ${styles.sectionTitle}`}><span>04</span><div><p className="eyebrow">Give this to your coding agent</p><h2>Start from a complete implementation brief.</h2></div></header>
          <CodeBlock label="COPYABLE BRIEF">{"Add the Arc Agent-in-a-Box starter to my application.\n\nMy API documentation: [URL]\nRequired operations: [LIST]\n\nImplement typed Aomi tools for those operations, keep deterministic\nmoney checks in code, deploy through Aomi Build, and embed the returned\nApplication ID with @aomi-labs/widget-lib in locked Direct mode. Keep\nCircle Wallet signing behind explicit review. Verify one approved action\nand at least two refusal cases.\n\nSource: https://github.com/aomi-labs/arc-canteen"}</CodeBlock>
        </div>
      </section>

      <section className="resource-strip"><div className="container resource-table"><span>05 · Reference</span><ExternalLink href={links.invoiceAgent}>Agent template ↗</ExternalLink><ExternalLink href={links.buildDocs}>Aomi Build ↗</ExternalLink><ExternalLink href={links.agentDocs}>Agent API ↗</ExternalLink><ExternalLink href={links.tameion}>Tameion ↗</ExternalLink></div></section>
    </>
  );
}
