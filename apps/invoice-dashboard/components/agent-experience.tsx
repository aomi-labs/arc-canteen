"use client";

import { AomiWidget } from "@aomi-labs/widget-lib";
import { useMemo, useState } from "react";

interface AgentExperienceProps {
  applicationId: string;
  backendUrl: string;
}

function AgentChat({ applicationId, backendUrl }: { applicationId: number; backendUrl: string }) {
  return (
    <section className="widget-column">
      <div className="widget-heading">
        <p className="eyebrow">Aomi Widget · Application {applicationId}</p>
        <p>Use the canonical hosted interface—not a reimplemented chat client.</p>
      </div>
      <div className="widget-shell">
        <AomiWidget
          applicationId={String(applicationId)}
          apiUrl={backendUrl}
          auth={{ kind: "browser_wallet" }}
          wallets={{ evm: { preset: "popular" }, solana: false }}
          walletFamilies={["evm"]}
          walletPosition="footer"
          routing={{
            targets: [{ mode: "direct", apps: [{ applicationId }] }],
            defaultMode: "direct",
          }}
          showSidebar={false}
          persistThread
          threadPersistenceKey={`arc-invoice-agent-${applicationId}-widget`}
          height="680px"
        />
      </div>
      <div className="prompt-guide" aria-label="Invoice prompts to try">
        <span>Try in the composer</span>
        <code>Pay invoice INV-1042 if it is still safe.</code>
        <code>Pay invoice INV-1043.</code>
        <code>Pay invoice INV-1044.</code>
      </div>
    </section>
  );
}

type Decision =
  | { decision: "approve"; invoiceId: string; recipient: string; amountUsdc: string; chainId: number; reason: string }
  | { decision: "refuse"; invoiceId: string; code: string; reason: string };

function CircleReview() {
  const [invoiceId, setInvoiceId] = useState("INV-1042");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const canExecute = decision?.decision === "approve";

  async function review() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/decision`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Review failed");
      setDecision(body);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!canExecute) return;
    setBusy(true);
    try {
      const response = await fetch("/api/circle/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId, confirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Circle execution failed");
      setResult(body);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel review-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Circle Agent Wallet</p>
          <h2>Explicit execution review</h2>
        </div>
        <span className="status preview">Local signer</span>
      </div>
      <label>
        Invoice
        <select value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setDecision(null); setResult(null); }}>
          <option>INV-1042</option>
          <option>INV-1043</option>
          <option>INV-1044</option>
        </select>
      </label>
      <button className="primary" onClick={review} disabled={busy}>Review application checks</button>
      {decision ? (
        <div className={`decision ${decision.decision}`}>
          <strong>{decision.decision === "approve" ? "Ready for wallet review" : "Payment refused"}</strong>
          <p>{decision.reason}</p>
          {decision.decision === "approve" ? (
            <dl>
              <div><dt>Recipient</dt><dd>{decision.recipient}</dd></div>
              <div><dt>Amount</dt><dd>{decision.amountUsdc} USDC</dd></div>
              <div><dt>Chain</dt><dd>Arc Testnet · {decision.chainId}</dd></div>
            </dl>
          ) : <code>{decision.code}</code>}
        </div>
      ) : null}
      {canExecute ? (
        <button className="danger" onClick={execute} disabled={busy}>
          Confirm exact Circle CLI transfer
        </button>
      ) : null}
      {result ? <pre className="result">{JSON.stringify(result, null, 2)}</pre> : null}
      <p className="fine-print">
        This loopback-only reference route invokes the installed Circle CLI without a shell. A
        production app must place the adapter behind its own authenticated backend.
      </p>
    </section>
  );
}

export function AgentExperience({ applicationId, backendUrl }: AgentExperienceProps) {
  const numericApplicationId = useMemo(() => Number(applicationId), [applicationId]);
  if (!applicationId || !Number.isInteger(numericApplicationId)) {
    return (
      <div className="workspace">
        <section className="setup panel">
          <p className="eyebrow">Agent connection</p>
          <h2>Connect the activated Aomi App</h2>
          <ol>
            <li>Deploy <code>templates/invoice-agent</code> through Aomi Build.</li>
            <li>Set <code>INVOICE_API_BASE_URL</code> to this dashboard&apos;s public <code>/api</code> URL.</li>
            <li>Set <code>NEXT_PUBLIC_AOMI_APPLICATION_ID</code> to the activated Application ID.</li>
          </ol>
          <p className="fine-print">The invoice API and deterministic decision proof remain available beside this setup state.</p>
        </section>
        <CircleReview />
      </div>
    );
  }
  return (
    <div className="workspace">
      <AgentChat applicationId={numericApplicationId} backendUrl={backendUrl} />
      <CircleReview />
    </div>
  );
}
