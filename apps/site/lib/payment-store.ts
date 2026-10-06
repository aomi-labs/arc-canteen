import {
  evaluateInvoice,
  getPaymentStatus,
  type InvoiceDecision,
  type PaymentStatus,
} from "@arc-canteen/invoice-workflow";

const globalStore = globalThis as typeof globalThis & {
  arcInvoicePayments?: Map<string, PaymentStatus>;
};

const store = globalStore.arcInvoicePayments ?? new Map<string, PaymentStatus>();
globalStore.arcInvoicePayments = store;

export function readPayment(invoiceId: string): PaymentStatus | undefined {
  return store.get(invoiceId) ?? getPaymentStatus(invoiceId);
}

export function evaluateCurrentInvoice(invoiceId: string): InvoiceDecision {
  const decision = evaluateInvoice(invoiceId);
  if (decision.decision === "approve" && readPayment(invoiceId)?.status === "confirmed") {
    return {
      decision: "refuse",
      invoiceId,
      code: "already_paid",
      reason: "The invoice already has a confirmed payment.",
    };
  }
  return decision;
}

export function recordPayment(invoiceId: string, transactionHash: string): PaymentStatus {
  if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error("Invalid Arc transaction hash");
  const existing = readPayment(invoiceId);
  if (existing?.status === "confirmed") {
    if (existing.transactionHash?.toLowerCase() !== transactionHash.toLowerCase()) {
      throw new Error("Invoice already has a different confirmed payment");
    }
    return existing;
  }
  const payment: PaymentStatus = {
    invoiceId,
    status: "confirmed",
    transactionHash: transactionHash.toLowerCase() as `0x${string}`,
  };
  store.set(invoiceId, payment);
  return payment;
}
