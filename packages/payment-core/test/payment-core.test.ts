import assert from "node:assert/strict";
import test from "node:test";
import {
  ARC_TESTNET_USDC,
  CIRCLE_CLI_VERSION,
  CircleCliSettlementAdapter,
  CircleCliTimeoutError,
  InMemorySettlementJournal,
  evaluatePayment,
  reconcileOnce,
  settleOnce,
  type ApprovedPaymentIntent,
  type HexAddress,
  type PaymentIntent,
  type PaymentPolicy,
  type SettlementReceipt,
} from "../src/index";

const SOURCE = "0x1111111111111111111111111111111111111111" as HexAddress;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as HexAddress;
const TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: "a2a16074-fc6b-4c8c-8625-5a83bde2603c",
    invoiceId: "invoice-001",
    chain: "ARC-TESTNET",
    source: SOURCE,
    recipient: RECIPIENT,
    amountUsdcMicros: 1_500_000n,
    ...overrides,
  };
}

function policy(overrides: Partial<PaymentPolicy> = {}): PaymentPolicy {
  return {
    chain: "ARC-TESTNET",
    source: SOURCE,
    approvedRecipients: new Set([RECIPIENT.toLowerCase()]),
    paidInvoiceIds: new Set(),
    maxAmountUsdcMicros: 10_000_000n,
    ...overrides,
  };
}

function approve(value = intent()) {
  const decision = evaluatePayment(value, policy());
  assert.equal(decision.status, "approved");
  return decision.intent;
}

function confirmedStdout(state: string) {
  return JSON.stringify({
    data: {
      id: "circle-operation-1",
      state,
      txHash: TX_HASH,
    },
  });
}

test("approves the expected Arc Testnet payment", () => {
  const decision = evaluatePayment(intent(), policy());
  assert.equal(decision.status, "approved");
});

test("rejects a recipient that is not on the application allowlist", () => {
  const decision = evaluatePayment(
    intent({
      recipient: "0x3333333333333333333333333333333333333333",
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

test("pins the Circle CLI version used by the adapter contract", () => {
  assert.equal(CIRCLE_CLI_VERSION, "1.1.4");
  assert.equal(
    ARC_TESTNET_USDC,
    "0x3600000000000000000000000000000000000000",
  );
});

test("Circle adapter maps an approved intent to execFile arguments", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new CircleCliSettlementAdapter(SOURCE, {
    async run(executable, args) {
      calls.push({ executable, args });
      return { stdout: confirmedStdout("CONFIRMED"), stderr: "" };
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
        "--token",
        ARC_TESTNET_USDC,
        "--idempotency-key",
        "a2a16074-fc6b-4c8c-8625-5a83bde2603c",
        "--output",
        "json",
      ],
    },
  ]);
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.txHash, TX_HASH);
});

test("Circle adapter accepts COMPLETE as a confirmed terminal state", async () => {
  const adapter = new CircleCliSettlementAdapter(SOURCE, {
    async run() {
      return { stdout: confirmedStdout("COMPLETE"), stderr: "" };
    },
  });

  const receipt = await adapter.settle(approve());
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.providerStatus, "COMPLETE");
});

test("Circle adapter treats timeouts as unresolved", async () => {
  const adapter = new CircleCliSettlementAdapter(SOURCE, {
    async run() {
      throw new CircleCliTimeoutError();
    },
  });

  const receipt = await adapter.settle(approve());
  assert.equal(receipt.status, "unresolved");
  assert.equal(receipt.providerStatus, "TIMEOUT");
  assert.equal(receipt.txHash, undefined);
});

test("reconciliation reuses the payment UUID as the Circle idempotency key", async () => {
  const keys: string[] = [];
  const adapter = new CircleCliSettlementAdapter(SOURCE, {
    async run(_executable, args) {
      const index = args.indexOf("--idempotency-key");
      keys.push(String(args[index + 1]));
      return { stdout: confirmedStdout("CONFIRMED"), stderr: "" };
    },
  });
  const approved = approve();

  await adapter.settle(approved);
  await adapter.reconcile(approved);

  assert.deepEqual(keys, [approved.id, approved.id]);
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
        txHash: TX_HASH,
      };
    },
  };

  await settleOnce(approved, adapter, journal);
  await assert.rejects(() => settleOnce(approved, adapter, journal));
  await assert.rejects(() => settleOnce(sameInvoice, adapter, journal));

  assert.equal(sends, 1);
  assert.equal(journal.get(approved.id)?.status, "confirmed");
  assert.equal((await journal.getByInvoiceId(approved.invoiceId))?.status, "confirmed");
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

test("reconcileOnce confirms an unresolved payment without a new claim", async () => {
  const approved = approve();
  const journal = new InMemorySettlementJournal();
  await journal.begin(approved);
  await journal.unresolved(approved.id, { error: "circle_cli_timeout" });

  const adapter = {
    async settle(): Promise<SettlementReceipt> {
      throw new Error("settle must not run during reconcile");
    },
    async reconcile(value: ApprovedPaymentIntent): Promise<SettlementReceipt> {
      return {
        intentId: value.id,
        provider: "circle-agent-wallet",
        status: "confirmed",
        txHash: TX_HASH,
      };
    },
  };

  const receipt = await reconcileOnce(approved, adapter, journal);
  assert.equal(receipt.status, "confirmed");
  assert.equal(journal.get(approved.id)?.status, "confirmed");
});
