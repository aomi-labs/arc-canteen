import type { ReactNode } from "react";

const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|(--[\w.-]+)|(\b(?:import|from|export|const|let|type|return|function|async|await|new|interface)\b)|(\b(?:npm|npx|cargo|aomi-build|aomi|mkdir|cd|uv)\b)/g;

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
  if (/^(npm|npx|cargo|aomi|mkdir|cd)\b/m.test(code)) return "terminal";
  return "prompt";
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
      </figcaption>
      <pre className="code-sample">
        <code>{highlight(code)}</code>
      </pre>
    </figure>
  );
}
