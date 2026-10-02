import assert from "node:assert/strict";
import test from "node:test";
import type { HexAddress, JsonValue, Uuid } from "@arc-canteen/payment-core";
import { classifySessionJson, classifySessionText } from "../src/circle";
import {
  isUniqueViolation,
  PostgresInvoiceStore,
  PostgresPaymentStore,
} from "../src/postgres";
import { SCHEMA_SQL } from "../src/schema";
import type { PaymentRecord } from "../src/store";

const SOURCE = "0x1111111111111111111111111111111111111111" as HexAddress;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as HexAddress;

function record(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "a2a16074-fc6b-4c8c-8625-5a83bde2603c" as Uuid,
    invoiceId: "invoice-001",
    status: "in_progress",
    chain: "ARC-TESTNET",
    source: SOURCE,
    recipient: RECIPIENT,
    amountUsdcMicros: 1_500_000n,
    policyDecision: { status: "approved" },
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    ...overrides,
  };
}

test("schema declares unique payment UUID and invoice id constraints", () => {
  assert.match(SCHEMA_SQL, /id UUID PRIMARY KEY/);
  assert.match(SCHEMA_SQL, /invoice_id TEXT NOT NULL UNIQUE/);
});

test("Postgres journal maps unique violations to a failed claim", async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (text.includes("INSERT INTO payments")) {
        throw { code: "23505" };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const store = new PostgresPaymentStore(client);
  const claimed = await store.insertInProgress(record());
  assert.equal(claimed, false);
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(statements.some((sql) => sql.includes("INSERT INTO payments")), true);
});

test("Postgres invoice store upserts application-owned invoices", async () => {
  const params: unknown[] = [];
  const store = new PostgresInvoiceStore({
    async query(_text, values = []) {
      params.push(...values);
      return { rows: [], rowCount: 1 };
    },
  });

  await store.upsert({
    id: "invoice-001",
    recipient: RECIPIENT,
    amountUsdcMicros: 1_500_000n,
    chain: "ARC-TESTNET",
    approved: true,
  });

  assert.deepEqual(params, [
    "invoice-001",
    RECIPIENT,
    "1500000",
    "ARC-TESTNET",
    true,
  ]);
});

test("classifies absent and expired Circle sessions", () => {
  const absent = classifySessionText(
    "Error: Not logged in. Run circle wallet login",
  );
  assert.equal(absent.ok, false);
  if (!absent.ok) {
    assert.equal(absent.reason, "absent");
  }
  assert.equal(
    classifySessionJson({
      data: {
        authenticated: true,
        testnet: true,
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    } as JsonValue).ok,
    false,
  );
  const current = classifySessionJson({
    data: {
      authenticated: true,
      email: "ops@example.com",
      testnet: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  } as JsonValue);
  assert.equal(current.ok, true);
});
