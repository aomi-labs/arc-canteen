import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { RecipeCard } from "@/components/recipe-card";
import { ExternalLink } from "@/components/site-shell";
import { build } from "@/content/build";
import { site } from "@/content/site";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy dev-lead">
            <div className="event-line">
              <span className="event-badge">Tameion</span>
              <span>{site.event.dates}</span>
            </div>
            <h1>
              {site.home.headlineLines[0]}
              <br />
              {site.home.headlineLines[1]}
            </h1>
            <p className="hero-intro">{site.home.intro}</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="#stack">
                {site.home.startLabel}
              </Link>
              <Link className="button button-outline" href="/quickstart">
                {site.home.buildLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="stack" aria-labelledby="stack-heading">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">What to run</p>
            <h2 id="stack-heading">Five tools. One place each.</h2>
            <p>Use the tool that already owns the job. Aomi is the host or the execution path in the middle. It is not a second Arc, and it is not a second Circle wallet.</p>
          </div>
          <div className="tool-list">
            {site.home.stack.map((tool) => (
              <article className="tool-row" key={tool.n}>
                <span className="number">{tool.n}</span>
                <div>
                  <p className="tool-who">{tool.who}</p>
                  <h3>{tool.title}</h3>
                  <p>{tool.body}</p>
                  <ExternalLink className="text-link" href={tool.href}>{tool.hrefLabel}</ExternalLink>
                </div>
                <CodeWindow code={tool.code} title="shell" />
              </article>
            ))}
          </div>
          <div className="seam-table" role="table">
            {site.home.seams.map((row) => (
              <div className="seam-row" role="row" key={row.job}>
                <strong>{row.job}</strong>
                <span>{row.use}</span>
                <p>{row.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section problem-section" aria-labelledby="problem-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div>
              <p className="eyebrow">{site.home.problemEyebrow}</p>
              <h2 id="problem-heading">{site.home.problemTitle}</h2>
            </div>
            <div>
              <p>{site.home.problemBody}</p>
              <ExternalLink className="text-link" href={site.links.canteenResearch}>
                {site.home.problemSource}
              </ExternalLink>
            </div>
          </div>
          <div className="problem-grid">
            {site.home.problemPoints.map((point) => (
              <div className="problem-item" key={point.label}>
                <span className="number">{point.label}</span>
                <h3>{point.title}</h3>
                <p>{point.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section figures" aria-label="Platform figures">
        <div className="container">
          <p className="eyebrow">{site.home.figuresEyebrow}</p>
          <div className="figure-row">
            {site.home.figures.map((figure) => (
              <div key={figure.label}>
                <strong>{figure.value}</strong>
                <span>{figure.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section problem-section" aria-labelledby="why-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div>
              <p className="eyebrow">Why Aomi</p>
              <h2 id="why-heading">Don’t rebuild the execution layer.</h2>
            </div>
            <div>
              <p>
                Aomi is the execution harness for onchain finance: the layer between an agent’s
                decision and the signature that makes it real.
              </p>
              <Link className="text-link" href="/build">Read the full developer reference</Link>
            </div>
          </div>
          <div className="benefit-list">
            {build.benefits.map((item, index) => (
              <div className="benefit-row" key={item.title}>
                <span className="number">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section ideas-section" id="build" aria-labelledby="ideas-heading">
        <div className="container">
          <div className="section-head ideas-heading">
            <p className="eyebrow">{site.home.ideasEyebrow}</p>
            <h2 id="ideas-heading">{site.home.ideasTitle}</h2>
            <p>{site.home.ideasBody}</p>
          </div>
          <div className="rfb-list">
            {site.rfbs.map((rfb) => (
              <article className="rfb-row" key={rfb.number}>
                <span className="rfb-number">{rfb.number}</span>
                <div className="rfb-body">
                  <h3>{rfb.name}</h3>
                  <p className="rfb-question">{rfb.question}</p>
                  <p>{rfb.aomi}</p>
                </div>
                <div className="rfb-aside">
                  <span>{rfb.primitive}</span>
                  <strong>{rfb.firstBuild}</strong>
                  {"sampleHref" in rfb ? (
                    <ExternalLink className="text-link" href={rfb.sampleHref}>{rfb.sampleLabel}</ExternalLink>
                  ) : null}
                  <Link className="text-link" href={rfb.recipe}>{rfb.recipeLabel}</Link>
                </div>
              </article>
            ))}
          </div>
          <p className="rfb-source">Source: <ExternalLink href={site.links.tameion}>Tameion’s official requests for builders</ExternalLink></p>
        </div>
      </section>

      <section className="section recipes-section" aria-labelledby="recipes-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div><p className="eyebrow">{site.home.recipeEyebrow}</p><h2 id="recipes-heading">{site.home.recipeTitle}</h2></div>
            <p>{site.home.recipeBody}</p>
          </div>
          <div className="recipe-grid">{site.recipes.map((recipe) => <RecipeCard recipe={recipe} key={recipe.slug} />)}</div>
          <div className="next-step">
            <div><p className="eyebrow">Go first</p><h3>{site.home.closeTitle}</h3><p>{site.home.closeBody}</p></div>
            <Link className="button button-primary" href="/quickstart">Follow the quickstart</Link>
          </div>
        </div>
      </section>

      <section className="section" id="tameion" aria-labelledby="tameion-heading">
        <div className="container">
          <div className="judge-block">
            <div>
              <p className="eyebrow">Tameion</p>
              <h2 id="tameion-heading">Test USDC counts. Mainnet counts more.</h2>
              <p>{site.event.note}</p>
              <p>{site.tameion.prizes}</p>
              <p>{site.tameion.submit}</p>
              <p>{site.tameion.traction}</p>
              <div className="resource-links">
                <ExternalLink href={site.links.tameionRegister}>Register</ExternalLink>
                <ExternalLink href={site.links.tameionSubmit}>Submit a project</ExternalLink>
              </div>
            </div>
            <div className="judge-grid">
              {site.tameion.judging.map((item) => (
                <article key={item.label}>
                  <strong>{item.weight}</strong>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section ideas-section" aria-labelledby="examples-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div>
              <p className="eyebrow">Examples</p>
              <h2 id="examples-heading">{build.examples.title}</h2>
            </div>
            <p>{build.examples.intro}</p>
          </div>
          <div className="example-list">
            {build.examples.cases.map((item) => (
              <article className="example-row" key={item.name}>
                <h3>{item.name}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="rfb-source">{build.examples.stats}</p>
        </div>
      </section>
    </>
  );
}
