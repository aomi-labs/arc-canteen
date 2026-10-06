import type { Metadata } from "next";
import { links } from "@/components/links";
import { ExternalLink } from "@/components/site-shell";

export const metadata: Metadata = { title: "Aomi Fuzz for Arc Studio" };

export default function Fuzz() {
  return (
    <>
      <section className="compact-hero">
        <div className="container compact-hero-grid">
          <div>
            <p className="eyebrow blue-text">03 · Aomi Fuzz for Arc Studio</p>
            <h1>Break the contract before users do.</h1>
            <p className="lede">Connect an Arc Studio app. Aomi attacks its compiled Solidity on a held Arc fork, minimizes any property violation, and reports it only after two clean replays.</p>
            <div className="actions compact-actions"><ExternalLink className="button primary" href={links.arcStudioFuzz}>Open live fuzzer ↗</ExternalLink><ExternalLink className="button" href={links.arcStudioFuzzSource}>Open source ↗</ExternalLink></div>
          </div>
          <dl className="status-panel">
            <div><dt>Status</dt><dd><i /> Live</dd></div>
            <div><dt>Target</dt><dd>Arc Studio apps</dd></div>
            <div><dt>Engine</dt><dd>Aomi + evm-sim</dd></div>
            <div><dt>Effect</dt><dd>Simulation only</dd></div>
          </dl>
        </div>
      </section>

      <section className="runbook-section">
        <div className="container section-grid">
          <header className="section-index"><span>01</span><div><p className="eyebrow">Campaign flow</p><h2>From Studio artifact to verified finding.</h2></div></header>
          <div className="instruction-list">
            <div className="instruction"><b>01</b><div><strong>Connect Arc Studio</strong><p>Authorize the web app, then select the app and compiled contract to test.</p></div><span>Input: Studio app</span></div>
            <div className="instruction"><b>02</b><div><strong>Seal the artifact</strong><p>Mint a 30-minute link containing exactly one contract&apos;s source, ABI, and runtime bytecode.</p></div><span>Bounded HTTPS link</span></div>
            <div className="instruction"><b>03</b><div><strong>Map the attack surface</strong><p>The model proposes actors, properties, and ordered action templates.</p></div><span>Threat plan</span></div>
            <div className="instruction"><b>04</b><div><strong>Attack a held Arc fork</strong><p><code>evm-sim</code> installs code and executes multi-actor transaction sequences against pinned state.</p></div><span>No broadcast</span></div>
            <div className="instruction"><b>05</b><div><strong>Minimize and replay</strong><p>The app shrinks a violation to its shortest reproduction and replays it twice from baseline.</p></div><span>2× confirmation</span></div>
            <div className="instruction"><b>06</b><div><strong>Return the finding</strong><p>Only a reproducible violation becomes a finding that can be sent back to Arc Studio for a fix.</p></div><span>Output: evidence</span></div>
          </div>
        </div>
      </section>

      <section className="runbook-section">
        <div className="container section-grid">
          <header className="section-index"><span>02</span><div><p className="eyebrow">Ownership</p><h2>Separate imagination from execution facts.</h2></div></header>
          <div className="facts">
            <div className="fact"><strong>The model owns</strong><span>The threat model, actors, properties, and action templates.</span></div>
            <div className="fact"><strong>The Aomi app owns</strong><span>The breadth-first frontier, deduplication, minimization, and two-replay promotion rule.</span></div>
            <div className="fact"><strong>evm-sim owns</strong><span>The fork lifetime, installed code, ordered calls, balances, return data, and engine errors.</span></div>
            <div className="fact"><strong>The builder owns</strong><span>The target contract, remediation decision, and anything later signed or deployed.</span></div>
          </div>
        </div>
      </section>

      <section className="runbook-section proof-runbook">
        <div className="container section-grid">
          <header className="section-index"><span>03</span><div><p className="eyebrow">Finding standard</p><h2>Evidence before severity.</h2></div></header>
          <div>
            <div className="proof-grid">
              <article className="proof-card pass"><span className="label">Isolated</span><h3>Held Arc fork</h3><p>Every campaign runs on pinned simulation state. Nothing is signed, deployed, or broadcast.</p></article>
              <article className="proof-card pass"><span className="label">Minimal</span><h3>Shortest reproduction</h3><p>Failing traces are reduced so builders see the smallest sequence that still violates the property.</p></article>
              <article className="proof-card pass"><span className="label">Verified</span><h3>Two clean replays</h3><p>A violation that cannot reproduce twice remains unconfirmed and is not promoted to a finding.</p></article>
            </div>
            <p className="inline-note"><strong>Current boundary:</strong> the fuzzer installs runtime bytecode, so constructor-initialized state is not reproduced yet. Prefer deployed-instance fuzzing when constructor state is material.</p>
            <div className="actions compact-actions"><ExternalLink className="button primary" href={links.arcStudioFuzz}>Connect Arc Studio ↗</ExternalLink><ExternalLink className="button" href={links.arcStudioFuzzSource}>Inspect implementation ↗</ExternalLink></div>
          </div>
        </div>
      </section>
    </>
  );
}
