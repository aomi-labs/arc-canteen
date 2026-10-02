import assert from "node:assert/strict";
import test from "node:test";
import { CircleCliSettlementAdapter } from "../src/circle-cli";
import type {
  ApprovedPaymentIntent,
  HexAddress,
  PaymentIntent,
  SettlementReceipt,
} from "../src/domain";
import { evaluatePayment, type PaymentPolicy } from "../src/policy";
import {
  InMemorySettlementJournal,
  settleOnce,
} from "../src/workflow";

const SOURCE =
  "0x1111111111111111111111111111111111111111" as HexAddress;
const RECIPIENT =
  "0x2222222222222222222222222222222222222222" as HexAddress;

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: "a2a16074-fc6b-4c8c-8625-5a83bde2603c",
    invoiceId: "invoice-001",
    chain: "ARC-TESTNET",
    source: SOURCE,
    recipient: RECIPIENT,
    amountUsdcMicros: BigInt(1_500_000),
    ...overrides,
  };
}

function policy(overrides: Partial<PaymentPolicy> = {}): PaymentPolicy {
  return {
    chain: "ARC-TESTNET",
    source: SOURCE,
    approvedRecipients: new Set([RECIPIENT.toLowerCase()]),
    paidInvoiceIds: new Set(),
    maxAmountUsdcMicros: BigInt(10_000_000),
    ...overrides,
  };
}

function approve(value = intent()) {
  const decision = evaluatePayment(value, policy());
  assert.equal(decision.status, "approved");
  return decision.intent;
}

test("approves the expected Arc Testnet payment", () => {
  const decision = evaluatePayment(intent(), policy());
  assert.equal(decision.status, "approved");
});

test("rejects a recipient that is not on the application allowlist", () => {
  const decision = evaluatePayment(
    intent({
      recipient:
        "0x3333333333333333333333333333333333333333",
    }),
    policy(),
  );
  assert.deepEqual(decision, {
    status: "rejected",
    reason: "unapproved_recipient",
  });
});

test("rejects an invoice that has already been paid", () => {
  const decision = evaluatePayment(
    intent(),
    policy({ paidInvoiceIds: new Set(["invoice-001"]) }),
  );
  assert.deepEqual(decision, {
    status: "rejected",
    reason: "duplicate_invoice",
  });
});

test("Circle adapter maps only an approved intent to explicit CLI arguments", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new CircleCliSettlementAdapter(SOURCE, {
    async run(executable, args) {
      calls.push({ executable, args });
      return {
        stdout: JSON.stringify({
          data: {
            id: "circle-operation-1",
            state: "CONFIRMED",
            txHash:
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        }),
        stderr: "",
      };
    },
  });

  const receipt = await adapter.settle(approve());

  assert.deepEqual(calls, [
    {
      executable: "circle",
      args: [
        "wallet",
        "transfer",
        RECIPIENT,
        "--amount",
        "1.5",
        "--address",
        SOURCE,
        "--chain",
        "ARC-TESTNET",
        "--idempotency-key",
        "a2a16074-fc6b-4c8c-8625-5a83bde2603c",
        "--output",
        "json",
      ],
    },
  ]);
  assert.equal(receipt.status, "confirmed");
});

test("journal prevents a payment or invoice from being sent twice", async () => {
  const approved = approve();
  const sameInvoice = approve(
    intent({ id: "f4df0c21-adb6-4f26-8d44-fd61755e47eb" }),
  );
  let sends = 0;
  const journal = new InMemorySettlementJournal();

  const adapter = {
    async settle(value: ApprovedPaymentIntent): Promise<SettlementReceipt> {
      sends += 1;
      return {
        intentId: value.id,
        provider: "circle-agent-wallet",
        status: "confirmed",
        txHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      };
    },
  };

  await settleOnce(approved, adapter, journal);
  await assert.rejects(() => settleOnce(approved, adapter, journal));
  await assert.rejects(() => settleOnce(sameInvoice, adapter, journal));

  assert.equal(sends, 1);
  assert.equal(journal.get(approved.id)?.status, "confirmed");
});

test("a transport error stays unresolved and cannot be retried blindly", async () => {
  const approved = approve();
  let sends = 0;
  const journal = new InMemorySettlementJournal();
  const adapter = {
    async settle() {
      sends += 1;
      throw new Error("connection closed after submission");
    },
  };

  await assert.rejects(() => settleOnce(approved, adapter, journal));
  await assert.rejects(() => settleOnce(approved, adapter, journal));

  assert.equal(sends, 1);
  assert.equal(journal.get(approved.id)?.status, "unresolved");
});
