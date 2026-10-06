"use client";

import { AgentRun, Aomi, MessageEvent } from "@aomi-labs/client";
import { FormEvent, useMemo, useRef, useState } from "react";

interface AgentExperienceProps {
  applicationId: string;
  backendUrl: string;
}

function AgentChat({ applicationId, backendUrl }: { applicationId: number; backendUrl: string }) {
  const aomi = useMemo(() => new Aomi({ baseUrl: backendUrl }), [backendUrl]);
  const sessionId = useRef<string | undefined>(undefined);
  const activeRun = useRef<AgentRun | null>(null);
  const [prompt, setPrompt] = useState("Pay invoice INV-1042 if it is still safe.");
  const [messages, setMessages] = useState<readonly MessageEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayMessages = messages.filter((message) => message.content.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value) return;
    setError(null);
    setIsRunning(true);
    try {
      const run = aomi.agent.run(value, {
        sessionId: sessionId.current,
        target: { mode: "direct", applicationId },
      });
      activeRun.current = run;
      const result = await run.result();
      sessionId.current = result.sessionId;
      setMessages(result.messages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      activeRun.current = null;
      setIsRunning(false);
    }
  }

  async function stop() {
    const run = activeRun.current;
    if (!run) return;
    try {
      await run.interrupt();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="panel agent-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Aomi Agent API</p>
          <h2>Assistant inside your app</h2>
        </div>
        <span className={`status ${isRunning ? "running" : "ready"}`}>
          {isRunning ? "Working" : "Ready"}
        </span>
      </div>
      <div className="messages" aria-live="polite">
        {displayMessages.length === 0 ? (
          <p className="empty">Ask the deployed invoice agent to inspect one of the fixture invoices.</p>
        ) : (
          displayMessages.map((message) => (
            <article className={`message ${message.sender}`} key={message.event_id}>
              <span className="message-sender">{message.sender}</span>
              <pre>{message.content}</pre>
            </article>
          ))
        )}
      </div>
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      <div className="quick-prompts">
        <button onClick={() => setPrompt("Pay invoice INV-1042 if it is still safe.")}>Approved invoice</button>
        <button onClick={() => setPrompt("Pay invoice INV-1043.")}>Changed address</button>
        <button onClick={() => setPrompt("Pay invoice INV-1044.")}>Already paid</button>
      </div>
      <form onSubmit={submit} className="composer">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        {isRunning ? (
          <button type="button" onClick={stop}>Stop</button>
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
      <AgentChat applicationId={numericApplicationId} backendUrl={backendUrl} />
      <CircleReview />
    </div>
  );
}
