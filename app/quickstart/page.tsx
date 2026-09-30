import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { PromptBuilder } from "@/components/prompt-builder";
import { ExternalLink } from "@/components/site-shell";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Quickstart",
  description: site.quickstart.intro,
};

export default function QuickstartPage() {
  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/">Home</Link>
          <p className="eyebrow">{site.quickstart.eyebrow}</p>
          <h1>{site.quickstart.headline}</h1>
          <p>{site.quickstart.intro}</p>
          <div className="page-status">{site.quickstart.status}</div>
        </div>
      </div>
      <div className="page-content">
        <div className="container content-grid">
          <div>
            <div className="prereq-panel">
              <h2>{site.quickstart.beforeTitle}</h2>
              <ul>{site.quickstart.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
              <div className="resource-links link-row">
                <ExternalLink href={site.links.circleFaucet}>Circle faucet</ExternalLink>
                <ExternalLink href={site.links.arcExplorer}>Arc Testnet explorer</ExternalLink>
              </div>
            </div>
            <div className="step-list" aria-label="Steps to inspect an Arc Testnet transaction">
              {site.quickstart.steps.map((step) => (
                <section className="step-row" key={step.number}>
                  <span className="number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    {"code" in step && step.code ? <CodeWindow code={step.code} /> : null}
                    {step.kind === "prompt-builder" ? <PromptBuilder /> : null}
                    {step.number === "01" ? (
                      <ExternalLink className="text-link" href={site.links.portal}>
                        Open the Aomi Portal
                      </ExternalLink>
                    ) : null}
                    {step.number === "08" ? (
                      <ExternalLink className="text-link" href={site.links.arcExplorer}>
                        Open ArcScan
                      </ExternalLink>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
            <div className="note-panel">
              <h3>{site.quickstart.caveatTitle}</h3>
              <p>{site.quickstart.caveatBody}</p>
            </div>
            <div className="prereq-panel">
              <h2>Bring the receipt to Tameion</h2>
              <p>{site.tameion.network}</p>
              <div className="step-list">
                {site.tameion.start.map((step, index) => (
                  <section className="step-row" key={step.title}>
                    <span className="number">0{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                      {"code" in step && step.code ? <CodeWindow code={step.code} title="shell" /> : null}
                      <div className="resource-links link-row">
                        <ExternalLink href={step.href}>{step.hrefLabel}</ExternalLink>
                        {"secondHref" in step && step.secondHref ? (
                          <ExternalLink href={step.secondHref}>{step.secondLabel}</ExternalLink>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="next-step">
              <div><p className="eyebrow">Take it further</p><h3>{site.quickstart.nextTitle}</h3><p>{site.quickstart.nextBody}</p></div>
              <Link className="button button-primary" href="/recipes/agentic-payment">Build the payment flow</Link>
            </div>
          </div>
          <aside className="reading-rail">
            <p className="eyebrow">{site.quickstart.importantTitle}</p>
            {site.quickstart.distinctions.map((item) => <p key={item.term}><strong>{item.term}</strong> means {item.definition}</p>)}
            <ExternalLink href={site.links.transactionPipeline}>Read the full pipeline</ExternalLink>
          </aside>
        </div>
      </div>
    </div>
  );
}
