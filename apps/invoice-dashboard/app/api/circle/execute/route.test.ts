import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route.ts";

function request(url: string, origin?: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify({ invoiceId: "INV-1042", confirmed: true }),
  });
}

test("rejects the reference signer on public hosts", async () => {
  const response = await POST(request("https://invoice.example/api/circle/execute", "https://invoice.example"));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /loopback-only/);
});

test("rejects cross-origin requests even on loopback", async () => {
  const response = await POST(request("http://127.0.0.1:3001/api/circle/execute", "https://attacker.example"));
  assert.equal(response.status, 403);
});

test("reaches configuration gate only for same-origin loopback review", async () => {
  const response = await POST(request("http://127.0.0.1:3001/api/circle/execute", "http://127.0.0.1:3001"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, "preview");
});
