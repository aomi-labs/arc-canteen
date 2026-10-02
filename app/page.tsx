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
              Log in. You get an Arc Testnet wallet, test USDC, and an RPC.
              The key stays in your terminal.
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
            <h2 id="paths-heading">Then pick how you want to pay.</h2>
            <p>
              If you already have an agent, have Aomi prepare the transfer and
              sign it yourself. If you have an API, keep invoices and policy
              there. Call Circle from that API, not from the chat.
            </p>
          </div>
          <div className="path-grid">
            <article className="path-card">
              <div className="path-card-head">
                <span className="number">01</span>
                <span className="path-status">Your API</span>
              </div>
              <p className="eyebrow">You already have an API</p>
              <h3>Keep invoices on your API</h3>
              <p>
                Your API checks the invoice and the payee. Circle CLI sends
                the approved payment.
              </p>
              <CodeWindow code={HOST_BOUNDARY} title="typescript" />
              <p className="path-note">
                Circle stays behind your API. That is how this repo is built.
              </p>
              <Link className="text-link" href="/build#host-path">
                Read the API path
              </Link>
            </article>

            <article className="path-card">
              <div className="path-card-head">
                <span className="number">02</span>
                <span className="path-status path-status-live">Your key</span>
              </div>
              <p className="eyebrow">You already have an agent</p>
              <h3>Prepare the transfer. Sign it yourself.</h3>
              <p>
                Aomi queues the Action and simulates it. You sign with{" "}
                <code>--eoa</code> using the Canteen key. Use the Action id
                your session prints.
              </p>
              <CodeWindow code={EXECUTION_PATH} title="shell" />
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
              <h2 id="reference-heading">Refuse a bad payee in code.</h2>
            </div>
            <p>
              The example checks the recipient and the invoice ID. If a send
              times out, look up the payment. Don&apos;t send it again.
            </p>
          </div>
          <div className="proof-strip">
            <div><strong>6</strong><span>passing tests</span></div>
            <div><strong>6</strong><span>ERC-20 USDC decimals</span></div>
            <div><strong>1</strong><span>timeout ≠ two payments</span></div>
          </div>
          <div className="next-step">
            <div>
              <p className="eyebrow">Source included</p>
              <h3>Read the policy, the Circle call, and the tests.</h3>
              <p>
                The reference is the same TypeScript the tests run. A passing
                simulation means the transaction would run. It does not mean
                the invoice is real.
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
