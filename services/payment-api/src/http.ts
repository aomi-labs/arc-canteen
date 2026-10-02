import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  sendJson(res, status, { code, message });
}

export function readUrl(req: IncomingMessage) {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

export function requestPath(req: IncomingMessage) {
  return decodeURIComponent(readUrl(req).pathname);
}
