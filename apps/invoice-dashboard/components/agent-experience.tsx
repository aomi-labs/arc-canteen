"use client";

import { AomiRuntimeProvider, useAomiRuntime } from "@aomi-labs/react";
import { FormEvent, useMemo, useState } from "react";

interface AgentExperienceProps {
  applicationId: string;
  backendUrl: string;
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return String(message ?? "");
  const record = message as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    return record.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          return String((part as Record<string, unknown>).text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(record);
}

function AgentChat() {
  const runtime = useAomiRuntime();
  const [prompt, setPrompt] = useState("Pay invoice INV-1042 if it is still safe.");
  const messages = runtime.getMessages() as unknown[];

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (value) runtime.sendMessage(value);
  }

  return (
    <section className="panel agent-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Aomi Agent API</p>
          <h2>Assistant inside your app</h2>
        </div>
        <span className={`status ${runtime.isRunning ? "running" : "ready"}`}>
          {runtime.isRunning ? "Working" : "Ready"}
        </span>
      </div>
      <div className="messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty">Ask the deployed invoice agent to inspect one of the fixture invoices.</p>
        ) : (
          messages.map((message, index) => (
            <article className="message" key={index}>
              <pre>{messageText(message)}</pre>
            </article>
          ))
        )}
      </div>
      <div className="quick-prompts">
        <button onClick={() => setPrompt("Pay invoice INV-1042 if it is still safe.")}>Approved invoice</button>
        <button onClick={() => setPrompt("Pay invoice INV-1043.")}>Changed address</button>
        <button onClick={() => setPrompt("Pay invoice INV-1044.")}>Already paid</button>
      </div>
      <form onSubmit={submit} className="composer">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        {runtime.isRunning ? (
          <button type="button" onClick={runtime.cancelGeneration}>Stop</button>
        ) : (
          <button type="submit">Send to agent</button>
        )}
      </form>
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
      <AomiRuntimeProvider backendUrl={backendUrl} applicationId={numericApplicationId}>
        <AgentChat />
      </AomiRuntimeProvider>
      <CircleReview />
    </div>
  );
}
