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
    "A typed payment policy, Circle CLI settlement adapter, retry journal, and tests for one Arc payment.",
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
          <h1>One contract. Two honest settlement lanes.</h1>
          <p>
            This page is rendered from the TypeScript files that the test runner
            executes. It proves the application boundary around one payment. It
            does not claim that Circle can sign an Aomi Action.
          </p>
          <div className="page-status">6 policy and adapter tests passing locally</div>
        </div>
      </div>

      <div className="page-content">
        <div className="container">
          <section className="recipe-detail" style={{ marginTop: 0 }}>
            <p className="eyebrow">The decision</p>
            <h2>Pick the signer before you write the integration.</h2>
            <div className="ref-table" role="table">
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Aomi Execution</strong>
                <span className="ref-right" role="cell">
                  Supported today with a builder-held EOA and <code>--eoa</code>.
                  Aomi constructs and simulates the Action.
                </span>
              </div>
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Circle agent wallet</strong>
                <span className="ref-right" role="cell">
                  Supported through Circle CLI. The developer API owns policy and
                  calls the CLI adapter after approval.
                </span>
              </div>
              <div className="ref-row" role="row">
                <strong className="ref-left" role="cell">Aomi → Circle signer</strong>
                <span className="ref-right" role="cell">
                  Not supported. Circle CLI does not accept an Aomi export, and
                  <code> aomi tx sign</code> cannot use a Circle agent wallet.
                </span>
              </div>
            </div>
          </section>

          <section className="recipe-detail" id="contract">
            <p className="eyebrow">Shared domain</p>
            <h2>A PaymentIntent is the boundary.</h2>
            <p>
              Amounts use six-decimal USDC atomic units. The policy returns a
              discriminated union. Only the approved type reaches a settlement
              adapter.
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
            <p className="eyebrow">Host path · Circle settlement</p>
            <h2>Keep Circle behind the developer API.</h2>
            <p>
              An Aomi-hosted tool calls the API you own. The API evaluates the
              intent and invokes this adapter. Arguments are passed as an array,
              never interpolated into a shell string. The payment UUID is also
              Circle&apos;s idempotency key. The wallet session remains outside
              the Aomi App.
            </p>
            <CodeWindow code={CIRCLE_SETUP} title="shell" />
            <CodeWindow code={circle} title="examples/arc-payment/src/circle-cli.ts" />
            <div className="note-panel">
              <h3>Authentication boundary</h3>
              <p>
                Circle Agent Stack currently documents this wallet through its
                CLI. Its email-OTP session lasts seven days. This reference does
                not put that session or its secure-keychain material inside an
                Aomi-hosted App.
              </p>
            </div>
          </section>

          <section className="recipe-detail" id="execution-path">
            <p className="eyebrow">Existing-agent path · Aomi Execution</p>
            <h2>Simulate the Action, then use one EOA signer.</h2>
            <p>
              The chat must queue an Action before the later commands work. Use
              the id printed by your session; <code>action-1</code> is only the
              documented example.
            </p>
            <CodeWindow code={AOMI_EOA_PATH} title="shell" />
            <div className="note-panel">
              <h3>Why Circle is not shown here</h3>
              <p>
                A MetaMask export demonstrates an external-wallet handoff, but
                Circle CLI accepts a transfer or typed ABI call rather than that
                export. There is no <code>--format circle</code>.
              </p>
            </div>
          </section>

          <section className="recipe-detail" id="retries">
            <p className="eyebrow">Idempotency</p>
            <h2>A timeout is not permission to pay twice.</h2>
            <p>
              The journal claims an intent before settlement and records the
              confirmed receipt. Errors and non-confirmed results stay
              unresolved, so the same payment cannot simply be sent again.
              Production implementations should back this interface with a
              durable database, not the filesystem.
            </p>
            <CodeWindow code={workflow} title="examples/arc-payment/src/workflow.ts" />
          </section>

          <section className="recipe-detail" id="tests">
            <p className="eyebrow">Executable evidence</p>
            <h2>Every important refusal has a test.</h2>
            <p>
              The suite covers the valid payment, an unapproved recipient, a
              duplicate-invoice policy, exact Circle CLI arguments, a claimed
              payment or invoice retry, and an unresolved transport error.
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
