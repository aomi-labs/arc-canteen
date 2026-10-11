"use client";

import { useRef } from "react";
import styles from "./how-it-works.module.css";

type Diagram = "execution" | "agent";

const sequenceActors = [
  ["Your agent", 80],
  ["Circle wallet", 240],
  ["Aomi Task API", 400],
  ["Aomi runtime", 560],
  ["Gateway", 720],
  ["Arc", 880],
  ["Your app", 1040],
] as const;

const sequenceMessages = [
  [0, 1, "Sign exact Task request", false],
  [0, 2, "Request + EIP-712 authorization", false],
  [2, 3, "Simulate exact ordered calls", false],
  [2, 0, "Attested 402 quote", true],
  [0, 1, "Sign Gateway payment", false],
  [2, 4, "Submit separate payment", false],
  [2, 0, "Immutable artifact", true],
  [0, 1, "Sign exact execution", false],
  [1, 5, "Submit verified calls", false],
  [5, 6, "Receipt + contract events", true],
] as const;

export function HowItWorks({ diagram }: { diagram: Diagram }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const execution = diagram === "execution";

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => dialog.current?.showModal()}>
        How it works <span>↗</span>
      </button>
      <dialog
        className={styles.dialog}
        ref={dialog}
        onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}
      >
        <div className={styles.window}>
          <header className={styles.header}>
            <div><p>{execution ? "Execution Kit · sequence" : "Agent-in-a-Box · architecture"}</p><h3>{execution ? "From agent intent to verified Arc receipt" : "Your product supplies the tools. Aomi supplies the agent runtime."}</h3></div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close diagram">×</button>
          </header>
          {execution ? <ExecutionSequence /> : <AgentArchitecture />}
        </div>
      </dialog>
    </>
  );
}

export function ExecutionSequence() {
  return (
    <div className={styles.sequence}>
      <div className={styles.sequenceViewport}>
        <svg
          className={styles.sequenceDiagram}
          viewBox="0 0 1120 700"
          role="img"
          aria-labelledby="execution-sequence-title execution-sequence-description"
        >
          <title id="execution-sequence-title">Execution Kit sequence diagram</title>
          <desc id="execution-sequence-description">Your agent obtains separate Circle Wallet signatures for Task authorization, Gateway payment, and final Arc execution. Aomi simulates exact calls and returns an immutable artifact.</desc>
          <defs>
            <marker id="sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {sequenceActors.map(([actor, x]) => (
            <g key={actor}>
              <rect className={styles.actorBox} x={x - 62} y="12" width="124" height="48" />
              <text className={styles.actorLabel} x={x} y="41" textAnchor="middle">{actor}</text>
              <line className={styles.lifeline} x1={x} y1="60" x2={x} y2="682" />
            </g>
          ))}
          {sequenceMessages.map(([from, to, message, response], index) => {
            const x1 = sequenceActors[from][1];
            const x2 = sequenceActors[to][1];
            const y = 100 + index * 58;
            return (
              <g key={message}>
                <text className={styles.messageIndex} x="4" y={y + 4}>{String(index + 1).padStart(2, "0")}</text>
                <text className={styles.messageLabel} x={(x1 + x2) / 2} y={y - 12} textAnchor="middle">{message}</text>
                <line className={response ? styles.responseLine : styles.messageLine} x1={x1} y1={y} x2={x2} y2={y} markerEnd="url(#sequence-arrow)" />
              </g>
            );
          })}
        </svg>
      </div>
      <p className={styles.boundary}><strong>Control boundary:</strong> signing the Task grants no spending or execution authority. Aomi simulates the inner calls; Circle Wallet separately signs payment and execution. Your app marks completion only after the Arc receipt and expected events independently verify.</p>
    </div>
  );
}

function AgentArchitecture() {
  return (
    <div className={styles.architecture}>
      <section className={`${styles.system} ${styles.product}`}>
        <h4>Your product</h4>
        <div className={styles.boxRow}><span>Backend</span><span>Product API</span><span>Frontend</span></div>
        <p>Owns domain data, business rules, and the user experience.</p>
      </section>
      <div className={styles.flow}><span>typed API tools ↓</span><span>embedded agent ↑</span></div>
      <section className={`${styles.system} ${styles.aomi}`}>
        <h4>Aomi</h4>
        <div className={styles.boxRow}><span>Aomi App</span><b>→</b><span>Hosted runtime</span></div>
        <p>Your APIs become tools. The hosted runtime reasons, calls them, and returns bounded actions.</p>
      </section>
      <div className={styles.channelArrow}>Your frontend delivers the agent through the Aomi Widget →</div>
      <section className={`${styles.system} ${styles.users}`}>
        <h4>Users</h4>
        <div className={styles.userChannels}><span>Web app</span><span>Telegram</span><span>Discord</span><span>…</span></div>
      </section>
      <p className={styles.boundary}><strong>Builder boundary:</strong> replace the fixture API with your product operations, deploy the Aomi App, and embed the returned Application ID. Wallet review and signing remain in your application.</p>
    </div>
  );
}
