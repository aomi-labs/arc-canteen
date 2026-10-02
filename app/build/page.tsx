import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { ExternalLink } from "@/components/site-shell";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Arc payment reference",
  description:
    "Policy, Circle CLI calls, a retry journal, and tests for one Arc payment.",
};

const AOMI_EOA_PATH = [
  'aomi chat "Send 1 test USDC on Arc Testnet to 0xRecipient" \\',
  "  --new-session --public-key 0xYourAddress --chain 5042002",
  "aomi tx list",
  "aomi tx simulate action-1",
  "# Set PRIVATE_KEY in your local environment; do not paste it into this site.",
  "aomi tx sign action-1 --eoa",
].join("\n");

const CIRCLE_SETUP = [
  "npm install -g @circle-fin/cli",
  "circle wallet login you@example.com --testnet",
  "circle wallet list --type agent --chain ARC-TESTNET",
  "circle wallet fund --address 0xYourAgentWallet --chain ARC-TESTNET",
].join("\n");

async function source(path: string) {
  return readFile(join(process.cwd(), "examples", "arc-payment", path), "utf8");
}

export default async function BuildPage() {
  const [domain, policy, circle, workflow, tests] = await Promise.all([
    source("src/domain.ts"),
    source("src/policy.ts"),
    source("src/circle-cli.ts"),
    source("src/workflow.ts"),
    source("test/payment.test.ts"),
  ]);

  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/">Home</Link>
          <p className="eyebrow">Reference implementation</p>
          <h1>One payment. Two ways to send it.</h1>
          <p>
            This page is the TypeScript the tests run. It checks an invoice, a
            payee, and a timeout.
          </p>
          <div className="page-status">6 policy tests passing locally</div>
        </div>
      </div>

      <div className="page-content">
        <div className="container">
          <section className="recipe-detail" style={{ marginTop: 0 }}>
            <p className="eyebrow">The decision</p>
            <h2>Pick the signer first.</h2>
            <div className="ref-table" role="table">
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Aomi Execution</strong>
                <span className="ref-right" role="cell">
                  Have Aomi prepare the transfer. Sign with <code>--eoa</code> and
                  the Canteen key.
                </span>
              </div>
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Circle agent wallet</strong>
                <span className="ref-right" role="cell">
                  Keep invoices on your API. Call Circle from that API, not from
                  the chat.
                </span>
              </div>
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Do not mix them</strong>
                <span className="ref-right" role="cell">
                  Aomi cannot pass a Circle wallet to <code>aomi tx sign</code>.
                  Circle CLI does not take an Aomi export.
                </span>
              </div>
            </div>
          </section>

          <section className="recipe-detail" id="contract">
            <p className="eyebrow">Shared domain</p>
            <h2>The invoice is the unit of work.</h2>
            <p>
              The example tracks ERC-20 USDC on Arc Testnet in 6-decimal units.
              Arc&apos;s native gas USDC uses 18 decimals. The policy checks
              chain, wallet, payee, invoice ID, and amount.
            </p>
            <CodeWindow code={domain} title="examples/arc-payment/src/domain.ts" />
          </section>

          <section className="recipe-detail" id="policy">
            <p className="eyebrow">Application-owned policy</p>
            <h2>The prompt cannot approve a payment.</h2>
            <p>
              The rule checks the chain, source wallet, recipient allowlist,
              invoice id, and amount. These checks run outside the model.
            </p>
            <CodeWindow code={policy} title="examples/arc-payment/src/policy.ts" />
          </section>

          <section className="recipe-detail" id="host-path">
            <p className="eyebrow">Host path · Circle from your API</p>
            <h2>Call Circle from your API.</h2>
            <p>
              If you have an API, keep invoices and policy there. Call Circle
              from that API, not from the chat. Arguments go in as an array.
              The payment UUID is the idempotency key.
            </p>
            <CodeWindow code={CIRCLE_SETUP} title="shell" />
            <CodeWindow code={circle} title="examples/arc-payment/src/circle-cli.ts" />
            <div className="note-panel">
              <h3>Keep the Circle session on your API</h3>
              <p>
                Circle documents this wallet through its CLI. The email-OTP
                session lasts seven days. That session stays on your API, not
                inside an Aomi App. That is how this repo is built.
              </p>
            </div>
          </section>

          <section className="recipe-detail" id="execution-path">
            <p className="eyebrow">Existing-agent path · Aomi Execution</p>
            <h2>Simulate the Action, then sign once.</h2>
            <p>
              The chat must queue an Action before the later commands work. Use
              the id printed by your session; <code>action-1</code> is only the
              documented example.
            </p>
            <CodeWindow code={AOMI_EOA_PATH} title="shell" />
            <div className="note-panel">
              <h3>Circle CLI takes a transfer, not an Aomi export</h3>
              <p>
                A MetaMask export can hand off an external wallet. Circle CLI
                wants a transfer or a typed ABI call. There is no{" "}
                <code>--format circle</code>.
              </p>
            </div>
          </section>

          <section className="recipe-detail" id="retries">
            <p className="eyebrow">Idempotency</p>
            <h2>A timeout is not permission to pay twice.</h2>
            <p>
              The journal records the payment before the send. If the result is
              unclear, look up that payment. Don&apos;t send it again.
              Production code should store this in a database, not on the
              filesystem.
            </p>
            <CodeWindow code={workflow} title="examples/arc-payment/src/workflow.ts" />
          </section>

          <section className="recipe-detail" id="tests">
            <p className="eyebrow">Tests</p>
            <h2>Every important refusal has a test.</h2>
            <p>
              The suite covers a valid payment, a bad payee, a duplicate
              invoice, the Circle CLI arguments, a retry of a claimed payment,
              and a send that times out.
            </p>
            <CodeWindow code="pnpm test" title="shell" />
            <CodeWindow code={tests} title="examples/arc-payment/test/payment.test.ts" />
          </section>

          <section className="resource-panel">
            <h3>Docs used by this reference</h3>
            <p>
              Check the installed command’s help before relying on a copied
              snippet. Aomi and Circle are separate authorities for their
              command surfaces.
            </p>
            <div className="resource-links">
              <ExternalLink href={site.links.aomiSigning}>Aomi signing</ExternalLink>
              <ExternalLink href={site.links.circleCliDocs}>Circle CLI</ExternalLink>
              <ExternalLink href={site.links.arcAgentic}>Arc agentic economy</ExternalLink>
              <ExternalLink href={site.links.arcCanteen}>Canteen bento</ExternalLink>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
