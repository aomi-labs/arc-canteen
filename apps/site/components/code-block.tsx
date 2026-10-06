"use client";

import { useState } from "react";

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="command-block">
      <div className="command-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{label ?? "CODE"}</span>
        <button type="button" onClick={copy} style={{ border: 0, padding: 0, background: "transparent", color: "inherit", font: "inherit", letterSpacing: "inherit", cursor: "pointer" }}>{copied ? "COPIED" : "COPY"}</button>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}
