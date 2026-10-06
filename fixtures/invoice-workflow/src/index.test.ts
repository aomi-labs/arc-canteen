import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInvoice } from "./index.ts";

test("approves the canonical unpaid invoice", () => {
  assert.deepEqual(evaluateInvoice("INV-1042"), {
    decision: "approve",
    invoiceId: "INV-1042",
    chainId: 5_042_002,
    recipient: "0x1111111111111111111111111111111111111111",
    amountUsdc: "1",
    amountWei: "1000000000000000000",
    reason: "The vendor is approved, the address is unchanged, and no payment is recorded.",
  });
});

test("refuses a changed vendor address", () => {
  const result = evaluateInvoice("INV-1043");
  assert.equal(result.decision, "refuse");
  if (result.decision === "refuse") assert.equal(result.code, "vendor_address_changed");
});

test("refuses an already-paid invoice", () => {
  const result = evaluateInvoice("INV-1044");
  assert.equal(result.decision, "refuse");
  if (result.decision === "refuse") assert.equal(result.code, "already_paid");
});
