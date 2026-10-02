import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  ARC_TESTNET_USDC,
  type ApprovedPaymentIntent,
  type CommandResult,
  type HexAddress,
  type SettlementReceipt,
} from "@arc-canteen/payment-core";
import { createPaymentHandler } from "../src/app";
import { loadConfig } from "../src/config";
import { InMemoryInvoiceStore } from "../src/invoices";
import { InMemoryPaymentStore } from "../src/store";

const SOURCE = "0x1111111111111111111111111111111111111111" as HexAddress;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as HexAddress;
const TX_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN = "test-bearer-token";

function config() {
  return loadConfig({
    PAYMENT_API_BEARER_TOKEN: TOKEN,
    CIRCLE_WALLET_ADDRESS: SOURCE,
    ARC_CHAIN: "ARC-TESTNET",
    PORT: "0",
  });
}

function fixtures() {
  return new InMemoryInvoiceStore([
    {
      id: "invoice-001",
      recipient: RECIPIENT,
      amountUsdcMicros: 1_500_000n,
      chain: "ARC-TESTNET",
      approved: true,
    },
    {
      id: "invoice-unapproved",
      recipient: RECIPIENT,
      amountUsdcMicros: 1_500_000n,
      chain: "ARC-TESTNET",
      approved: false,
    },
  ]);
}

async function withServer(
  overrides: {
    settle?: (
      intent: ApprovedPaymentIntent,
    ) => Promise<SettlementReceipt>;
    reconcile?: (
      intent: ApprovedPaymentIntent,
    ) => Promise<SettlementReceipt>;
    statusStdout?: string;
    statusError?: string;
  } = {},
  run: (baseUrl: string) => Promise<void>,
) {
  const calls: string[][] = [];
  const handler = createPaymentHandler({
    config: config(),
    invoices: fixtures(),
    store: new InMemoryPaymentStore(),
    adapter: {
      async settle(intent) {
        if (overrides.settle) {
          return overrides.settle(intent);
        }
        return {
          intentId: intent.id,
          provider: "circle-agent-wallet",
          status: "confirmed",
          providerId: "circle-operation-1",
          txHash: TX_HASH,
        };
      },
      async reconcile(intent) {
        if (overrides.reconcile) {
          return overrides.reconcile(intent);
        }
        return this.settle(intent);
      },
    },
    runner: {
      async run(_executable, args): Promise<CommandResult> {
        calls.push([...args]);
        if (overrides.statusError) {
          throw new Error(overrides.statusError);
        }
        return {
          stdout:
            overrides.statusStdout ??
            JSON.stringify({
              data: {
                authenticated: true,
                email: "ops@example.com",
                testnet: true,
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
            }),
          stderr: "",
        };
      },
    },
    circleExecutable: { executable: "circle", prefixArgs: [] },
  });

  const server = createServer((req, res) => {
    void handler(req, res);
  });
  const baseUrl = await listen(server);
  try {
    await run(baseUrl);
  } finally {
    await close(server);
  }
  return calls;
}

function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${TOKEN}`);
  }
  headers.set("accept", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("pays an approved invoice and returns the existing result on retry", async () => {
  let sends = 0;
  await withServer(
    {
      settle: async (intent) => {
        sends += 1;
        return {
          intentId: intent.id,
          provider: "circle-agent-wallet",
          status: "confirmed",
          providerId: "circle-operation-1",
          txHash: TX_HASH,
        };
      },
    },
    async (baseUrl) => {
      const first = await request(baseUrl, "/v1/invoices/invoice-001/pay", {
        method: "POST",
      });
      const second = await request(baseUrl, "/v1/invoices/invoice-001/pay", {
        method: "POST",
      });
      const status = await request(
        baseUrl,
        `/v1/payments/${first.body.paymentId}`,
      );

      assert.equal(first.status, 200);
      assert.equal(first.body.status, "confirmed");
      assert.equal(first.body.invoiceId, "invoice-001");
      assert.equal(first.body.txHash, TX_HASH);
      assert.equal(
        first.body.arcscanUrl,
        `https://testnet.arcscan.app/tx/${TX_HASH}`,
      );
      assert.deepEqual(second.body, first.body);
      assert.deepEqual(status.body, first.body);
      assert.equal(sends, 1);
    },
  );
});

test("refuses an unapproved invoice without calling Circle", async () => {
  let sends = 0;
  await withServer(
    {
      settle: async (intent) => {
        sends += 1;
        return {
          intentId: intent.id,
          provider: "circle-agent-wallet",
          status: "confirmed",
          txHash: TX_HASH,
        };
      },
    },
    async (baseUrl) => {
      const response = await request(
        baseUrl,
        "/v1/invoices/invoice-unapproved/pay",
        { method: "POST" },
      );
      assert.equal(response.status, 403);
      assert.equal(response.body.code, "unapproved_invoice");
      assert.equal(sends, 0);
    },
  );
});

test("requires a bearer token", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await request(baseUrl, "/v1/invoices/invoice-001/pay", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "unauthorized");
  });
});

test("reconciliation reuses the original payment UUID as the Circle idempotency key", async () => {
  const keys: string[] = [];
  await withServer(
    {
      settle: async (intent) => {
        keys.push(intent.id);
        return {
          intentId: intent.id,
          provider: "circle-agent-wallet",
          status: "unresolved",
          providerStatus: "TIMEOUT",
        };
      },
      reconcile: async (intent) => {
        keys.push(intent.id);
        return {
          intentId: intent.id,
          provider: "circle-agent-wallet",
          status: "confirmed",
          txHash: TX_HASH,
        };
      },
    },
    async (baseUrl) => {
      const paid = await request(baseUrl, "/v1/invoices/invoice-001/pay", {
        method: "POST",
      });
      assert.equal(paid.body.status, "unresolved");

      const reconciled = await request(
        baseUrl,
        `/v1/payments/${paid.body.paymentId}/reconcile`,
        { method: "POST" },
      );
      assert.equal(reconciled.status, 200);
      assert.equal(reconciled.body.status, "confirmed");
      assert.equal(reconciled.body.paymentId, paid.body.paymentId);
      assert.deepEqual(keys, [paid.body.paymentId, paid.body.paymentId]);
    },
  );
});

test("readiness fails when the Circle testnet session is absent", async () => {
  await withServer({ statusError: "Not logged in" }, async (baseUrl) => {
    const ready = await request(baseUrl, "/ready");
    const health = await request(baseUrl, "/health");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.circleSession, "absent");
    assert.equal(health.status, 503);
    assert.equal(health.body.circleSession, "absent");
  });
});

test("readiness fails when the Circle testnet session is expired", async () => {
  await withServer(
    {
      statusStdout: JSON.stringify({
        data: {
          authenticated: true,
          email: "ops@example.com",
          testnet: true,
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
      }),
    },
    async (baseUrl) => {
      const ready = await request(baseUrl, "/ready");
      assert.equal(ready.status, 503);
      assert.equal(ready.body.circleSession, "expired");
    },
  );
});

test("health succeeds when a current Circle testnet session exists", async () => {
  const calls = await withServer({}, async (baseUrl) => {
    const health = await request(baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.circleSession, "ok");
  });
  assert.deepEqual(calls[0], [
    "wallet",
    "status",
    "--type",
    "agent",
    "--output",
    "json",
  ]);
});

test("config pins Arc Testnet USDC", () => {
  const loaded = config();
  assert.equal(loaded.usdcToken, ARC_TESTNET_USDC);
  assert.equal(loaded.host, "0.0.0.0");
});
