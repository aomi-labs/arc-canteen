"use client";

import { useRef } from "react";
import styles from "./how-it-works.module.css";

type Diagram = "execution" | "agent";

const sequence = [
  ["01", "Your agent", "Aomi Task API", "Intent + exact constraints"],
  ["02", "Aomi Task API", "Your agent", "Attested Task + x402 quote"],
  ["03", "Your agent", "x402 Service", "Approve and purchase the plan"],
  ["04", "x402 Service", "Circle Wallet", "Simulate the bounded transfer"],
  ["05", "Circle Wallet", "Builder", "Show recipient, amount, and chain"],
  ["06", "Builder", "Circle Wallet", "Review and sign"],
  ["07", "Circle Wallet", "Arc", "Submit transaction"],
  ["08", "Arc", "Your app", "Verified receipt → mark complete"],
];

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

function ExecutionSequence() {
  return (
    <div className={styles.sequence}>
      <div className={styles.sequenceLegend}><span>Your intelligence</span><span>Aomi + x402</span><span>Your wallet + Arc</span></div>
      {sequence.map(([index, from, to, message]) => (
        <div className={styles.sequenceRow} key={index}>
          <b>{index}</b><div><span>{from}</span><i>→</i><span>{to}</span></div><p>{message}</p>
        </div>
      ))}
      <p className={styles.boundary}><strong>Control boundary:</strong> Aomi prepares and verifies the service result. Circle Wallet retains review and signing authority. Your app marks completion only after the Arc receipt is independently verified.</p>
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
