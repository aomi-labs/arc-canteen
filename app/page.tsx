import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { RecipeCard } from "@/components/recipe-card";
import { ExternalLink } from "@/components/site-shell";
import { site } from "@/content/site";

const CANTEEN_SETUP = [
  "uv tool install arc-canteen",
  "arc-canteen login",
  "arc-canteen wallet",
  "arc-canteen rpc-url",
].join("\n");

const HOST_BOUNDARY = [
  "const decision = evaluatePayment(intent, policy);",
  'if (decision.status === "rejected") return decision;',
  "",
  "return settleOnce(decision.intent, circle, journal);",
].join("\n");

const EXECUTION_PATH = [
  'aomi chat "Send 1 test USDC on Arc Testnet to 0xRecipient" \\',
  "  --public-key 0xYourAddress --chain 5042002",
  "aomi tx list",
  "aomi tx simulate action-1",
  "aomi tx sign action-1 --eoa",
].join("\n");

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
              <Link className="button button-primary" href="#paths">
                {site.home.startLabel}
              </Link>
              <Link className="button button-outline" href="/build">
                {site.home.buildLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="bench-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div>
              <p className="eyebrow">Shared prerequisite</p>
              <h2 id="bench-heading">Start on the Canteen bench.</h2>
            </div>
            <p>
              This provisions an Arc Testnet wallet, RPC, and local context.
              The key stays in your terminal. It is not a Circle agent wallet.
            </p>
          </div>
          <CodeWindow code={CANTEEN_SETUP} title="shell" />
          <div className="resource-links">
            <ExternalLink href={site.links.arcCanteen}>Canteen bento</ExternalLink>
            <ExternalLink href={site.links.arcAgentic}>Arc agentic economy</ExternalLink>
          </div>
        </div>
      </section>

      <section className="section problem-section" id="paths" aria-labelledby="paths-heading">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Choose one</p>
            <h2 id="paths-heading">Two paths. Two different signers.</h2>
            <p>
              Do not paste both paths as one pipeline. The Host path uses a
              developer-owned API and Circle adapter. The Execution path uses
              an Aomi Action and a builder-held EOA.
            </p>
          </div>
          <div className="path-grid">
            <article className="path-card">
              <div className="path-card-head">
                <span className="number">01</span>
                <span className="path-status">Reference boundary</span>
              </div>
              <p className="eyebrow">You own an API · no agent host</p>
              <h3>Aomi Host → your API → Circle wallet → Arc</h3>
              <p>
                Aomi hosts the conversation and calls a typed tool. Your API
                owns invoice data, policy, duplicate prevention, and the
                settlement adapter. Circle CLI sends the approved payment.
              </p>
              <CodeWindow code={HOST_BOUNDARY} title="typescript" />
              <p className="path-note">
                This repository implements and tests the TypeScript boundary.
                It does not claim that an Aomi-hosted App can inherit your
                local Circle CLI session.
              </p>
              <Link className="text-link" href="/build#host-path">
                Inspect the Host boundary
              </Link>
            </article>

            <article className="path-card">
              <div className="path-card-head">
                <span className="number">02</span>
                <span className="path-status path-status-live">Supported today</span>
              </div>
              <p className="eyebrow">Your agent already exists</p>
              <h3>Your agent → Aomi Execution → your EOA → Arc</h3>
              <p>
                Aomi constructs an Action and simulates it. On Arc, a key you
                hold signs with <code>--eoa</code>. Use the Action id printed
                by your own session.
              </p>
              <CodeWindow code={EXECUTION_PATH} title="shell" />
              <p className="path-note">
                Circle agent wallets cannot be passed to <code>aomi tx sign</code>
                and Circle CLI does not consume an Aomi export.
              </p>
              <Link className="text-link" href="/quickstart">
                Run the EOA quickstart
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="reference-heading">
        <div className="container">
          <div className="section-head split-heading">
            <div>
              <p className="eyebrow">Runnable reference</p>
              <h2 id="reference-heading">The policy is code, not copy.</h2>
            </div>
            <p>
              The example uses USDC atomic units, a discriminated policy
              result, an explicit settlement interface, a Circle CLI adapter,
              a provider idempotency key, and a journal that blocks blind
              retries until an unresolved result is reconciled.
            </p>
          </div>
          <div className="proof-strip">
            <div><strong>6</strong><span>passing tests</span></div>
            <div><strong>6</strong><span>USDC decimals</span></div>
            <div><strong>1</strong><span>settlement adapter per run</span></div>
          </div>
          <div className="next-step">
            <div>
              <p className="eyebrow">Source included</p>
              <h3>Read the types, policy, adapter, and tests.</h3>
              <p>
                The reference is displayed from the files that the test runner
                executes. The documentation and the implementation cannot drift
                into separate examples.
              </p>
            </div>
            <Link className="button button-primary" href="/build">
              Open the reference
            </Link>
          </div>
        </div>
      </section>

      <section className="section ideas-section" id="requests" aria-labelledby="ideas-heading">
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
    </>
  );
}
