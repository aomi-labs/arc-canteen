"use client";

import { useRef } from "react";

export function AgentDemoActions({ sourceUrl }: { sourceUrl: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div className="live-agent-actions">
        <a className="button primary" href={sourceUrl} target="_blank" rel="noreferrer">
          Source Code ↗
        </a>
        <button className="button" type="button" onClick={() => dialogRef.current?.showModal()}>
          How it works
        </button>
      </div>

      <dialog
        className="agent-flow-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="agent-flow-panel">
          <header>
            <div>
              <p className="eyebrow blue-text">Request lifecycle</p>
              <h2>From natural language to app action.</h2>
            </div>
            <button aria-label="Close diagram" type="button" onClick={() => dialogRef.current?.close()}>
              ×
            </button>
          </header>

          <div className="agent-flow-scroll">
            <svg className="agent-flow" viewBox="0 0 900 540" role="img" aria-labelledby="agent-flow-title agent-flow-description">
              <title id="agent-flow-title">Aomi agent request sequence</title>
              <desc id="agent-flow-description">A natural-language prompt travels from the browser widget through the Aomi backend to the hosted app and developer API, then streams back to the widget.</desc>
              <defs>
                <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--blue)" />
                </marker>
                <marker id="flow-arrow-return" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--orange)" />
                </marker>
              </defs>

              <g className="flow-participants">
                <rect x="20" y="16" width="170" height="54" rx="4" />
                <rect x="250" y="16" width="170" height="54" rx="4" />
                <rect x="480" y="16" width="170" height="54" rx="4" />
                <rect x="710" y="16" width="170" height="54" rx="4" />
                <text x="105" y="48">Browser Widget</text>
                <text x="335" y="48">Aomi Backend</text>
                <text x="565" y="48">Aomi App Layer</text>
                <text x="795" y="48">Developer API</text>
              </g>

              <g className="flow-lifelines">
                <line x1="105" y1="70" x2="105" y2="510" />
                <line x1="335" y1="70" x2="335" y2="510" />
                <line x1="565" y1="70" x2="565" y2="510" />
                <line x1="795" y1="70" x2="795" y2="510" />
              </g>

              <g className="flow-messages">
                <line x1="105" y1="118" x2="329" y2="118" />
                <text x="217" y="104">1 · Prompt + Application ID</text>

                <line x1="335" y1="194" x2="559" y2="194" />
                <text x="447" y="180">2 · Direct route loads the app</text>

                <line x1="565" y1="270" x2="789" y2="270" />
                <text x="677" y="256">3 · Typed tool call</text>

                <line className="return" x1="795" y1="346" x2="571" y2="346" />
                <text x="683" y="332">4 · Invoice + vendor data</text>

                <line className="return" x1="565" y1="422" x2="341" y2="422" />
                <text x="453" y="408">5 · Tool result + agent response</text>

                <line className="return" x1="335" y1="498" x2="111" y2="498" />
                <text x="223" y="484">6 · Streamed events and answer</text>
              </g>
            </svg>
          </div>

          <p className="agent-flow-boundary"><strong>Execution boundary:</strong> the Aomi App reads and reasons through typed tools. The host application keeps final Circle Wallet review and signing outside the prompt path.</p>
        </div>
      </dialog>
    </>
  );
}
