import Link from "next/link";
import { ExternalLink, links } from "@/components/site-shell";

const needs = [
  "Add an assistant to your dashboard",
  "Launch a hosted trading or finance agent on Arc",
  "Turn product UX into reviewed actions on Arc contracts",
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">For Tameion builders on Arc</p>
            <h1>Need AI support<br />in your app?</h1>
            <p className="lede">Bring the product and domain logic. Aomi supplies the agent runtime or the controlled path from a decision to a Circle Wallet transaction.</p>
            <div className="actions"><Link className="button primary" href="#products">Choose your path</Link><Link className="button" href="/proof/pay-the-right-invoice">Run the invoice proof</Link></div>
          </div>
          <div className="terminal-card">
            <div className="terminal-top"><i /><i /><i /><span>builder brief</span></div>
            {needs.map((need, index) => <div className="need" key={need}><span>0{index + 1}</span><p>{need}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section products" id="products">
        <div className="container">
          <p className="eyebrow">Start with one question</p>
          <h2>Do you already have an agent or decision engine?</h2>
          <div className="product-grid">
            <article className="product-card orange">
              <div className="card-top"><span className="answer">Yes</span><span className="status preview">Preview</span></div>
              <h3>Aomi × Circle Execution Kit</h3>
              <p>Keep your own agent. Send its intent to a hardened Task API client, require human review in Circle Agent Wallet, and verify the Arc receipt before your app marks work complete.</p>
              <ul><li>Task API attestation and x402 checks</li><li>Explicit wallet review</li><li>Independent Arc receipt verification</li></ul>
              <p className="availability">Hosted Task endpoint pending. The client and contract are implemented for integration testing.</p>
              <Link className="text-link" href="/execution-kit">Explore the execution path →</Link>
            </article>
            <article className="product-card blue">
              <div className="card-top"><span className="answer">No</span><span className="status ready">Live starter</span></div>
              <h3>Arc Agent-in-a-Box</h3>
              <p>Start from an Aomi App that can call your product APIs, reason over live domain state, prepare Arc transactions, simulate them, and surface the agent in your dashboard.</p>
              <ul><li>Custom API tools and policy</li><li>Hosted Aomi agent runtime</li><li>Embeddable headless UI client</li></ul>
              <p className="availability">The hosted invoice agent and direct Agent API accessor are live. Builders replace the fixture tools with their own app APIs; Circle signing stays in their wallet backend.</p>
              <Link className="text-link" href="/agent-in-a-box">Build an Arc agent →</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section demo-strip">
        <div className="container demo-grid">
          <div><p className="eyebrow">One proof, both products</p><h2>Pay the right invoice—and refuse the wrong one.</h2></div>
          <div><p>The same fixture demonstrates the boundary: the agent reads app-specific invoice APIs, the execution path requires review, and payment state changes only after a verified Arc receipt.</p><Link className="button light" href="/proof/pay-the-right-invoice">Open proof</Link></div>
        </div>
      </section>

      <section className="section compact">
        <div className="container resource-row"><span>Built for the <ExternalLink href={links.tameion}>Tameion Hackathon ↗</ExternalLink></span><span>Use the real <ExternalLink href={links.buildDocs}>Aomi build system ↗</ExternalLink>, not a fork of it.</span></div>
      </section>
    </>
  );
}
