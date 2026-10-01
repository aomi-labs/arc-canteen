"use client";

import { useState, type ReactNode } from "react";

const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|(--[\w.-]+)|(\b(?:import|from|export|const|let|type|return|function|async|await|new|interface)\b)|(\b(?:npm|npx|cargo|aomi-build|aomi|arc-canteen|circle|mkdir|cd|uv)\b)/g;

function highlight(code: string): ReactNode[] {
  return code.split("\n").map((line, index) => (
    <span className="code-line" key={`${index}-${line}`}>
      {line.length === 0 ? " " : tokenize(line)}
      {index < code.split("\n").length - 1 ? "\n" : null}
    </span>
  ));
}

function tokenize(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(line.slice(cursor, start));
    const [raw, string, comment, flag, keyword, command] = match;
    const kind = string ? "tok-string" : comment ? "tok-comment" : flag ? "tok-flag" : keyword ? "tok-keyword" : command ? "tok-command" : "";
    nodes.push(
      <span className={kind} key={`${start}-${raw}`}>
        {raw}
      </span>,
    );
    cursor = start + raw.length;
  }
  if (cursor < line.length) nodes.push(line.slice(cursor));
  return nodes;
}

function titleFor(code: string) {
  if (code.includes("import ") || code.includes("use client") || code.includes("interface ")) return "typescript";
  if (/^(npm|npx|cargo|aomi|arc-canteen|circle|mkdir|cd)\b/m.test(code)) return "terminal";
  return "prompt";
}

function copyWithTextarea(value: string) {
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  el.remove();
  return ok;
}

function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = copyWithTextarea(value);
    }
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className="code-copy"
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy"}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4A1.3 1.3 0 0 0 3.8 10.5H5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}

export function CodeWindow({ code, title }: { code: string; title?: string }) {
  return (
    <figure className="code-window">
      <figcaption className="code-window-bar">
        <span className="code-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{title ?? titleFor(code)}</span>
        <CopyCode value={code} />
      </figcaption>
      <pre className="code-sample">
        <code>{highlight(code)}</code>
      </pre>
    </figure>
  );
}
