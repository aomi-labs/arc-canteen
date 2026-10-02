import { randomUUID } from "node:crypto";
import {
  evaluatePayment,
  reconcileOnce,
  settleOnce,
  type ApprovedPaymentIntent,
  type HexHash,
  type PaymentIntent,
  type PolicyRejection,
  type ReconciliationAdapter,
  type SettlementJournal,
  type Uuid,
} from "@arc-canteen/payment-core";
import { arcscanUrl, type ServiceConfig } from "./config";
import type { Invoice, InvoiceStore } from "./invoices";
import { applyReceipt, type PaymentRecord, type PaymentStore } from "./store";

const MAX_ID_LENGTH = 200;

export type PaymentResponse = {
  id: Uuid;
  paymentId: Uuid;
  invoiceId: string;
  status: PaymentRecord["status"];
  provider?: string;
  providerId?: string;
  txHash?: string;
  arcscanUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export class PaymentServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

export function createPaymentService(deps: {
  config: ServiceConfig;
  invoices: InvoiceStore;
  store: PaymentStore;
  adapter: ReconciliationAdapter;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const journal = storeJournal(deps.store, explorer(deps.config.arcscanBaseUrl), now);

  return {
    async pay(invoiceId: string): Promise<PaymentResponse> {
      const invoice = await loadInvoice(deps.invoices, invoiceId);
      const existing = await deps.store.getByInvoiceId(invoice.id);
      if (existing) {
        return toResponse(existing);
      }

      let approved: ApprovedPaymentIntent;
      try {
        approved = await approveInvoice(invoice, deps);
      } catch (error) {
        if (
          error instanceof PaymentServiceError &&
          error.code === "duplicate_invoice"
        ) {
          const claimed = await deps.store.getByInvoiceId(invoice.id);
          if (claimed) {
            return toResponse(claimed);
          }
        }
        throw error;
      }

      try {
        await settleOnce(approved, deps.adapter, journal);
      } catch {
        const unresolved =
          (await deps.store.getByPaymentId(approved.id)) ??
          (await deps.store.getByInvoiceId(invoice.id));
        if (unresolved) {
          return toResponse(unresolved);
        }
        throw new PaymentServiceError(
          "settlement_failed",
          "Settlement failed before a journal record was stored",
          502,
        );
      }

      const settled = await deps.store.getByPaymentId(approved.id);
      if (!settled) {
        throw new PaymentServiceError(
          "settlement_failed",
          "Settlement completed without a journal record",
          502,
        );
      }
      return toResponse(settled);
    },

    async status(paymentId: string): Promise<PaymentResponse> {
      const record = await deps.store.getByPaymentId(validateId(paymentId, "payment_id"));
      if (!record) {
        throw new PaymentServiceError("not_found", "Payment not found", 404);
      }
      return toResponse(record);
    },

    async reconcile(paymentId: string): Promise<PaymentResponse> {
      const record = await deps.store.getByPaymentId(validateId(paymentId, "payment_id"));
      if (!record) {
        throw new PaymentServiceError("not_found", "Payment not found", 404);
      }
      if (record.status === "confirmed") {
        return toResponse(record);
      }

      const intent = toApprovedIntent(record);
      try {
        await reconcileOnce(intent, deps.adapter, journal);
      } catch {
        const unresolved = await deps.store.getByPaymentId(record.id);
        if (unresolved) {
          return toResponse(unresolved);
        }
        throw new PaymentServiceError(
          "reconciliation_failed",
          "Reconciliation failed",
          502,
        );
      }

      const updated = await deps.store.getByPaymentId(record.id);
      return toResponse(updated ?? record);
    },
  };
}

async function approveInvoice(
  invoice: Invoice,
  deps: {
    config: ServiceConfig;
    store: PaymentStore;
  },
): Promise<ApprovedPaymentIntent> {
  const paidInvoiceIds = await deps.store.claimedInvoiceIds();
  const decision = evaluatePayment(intentFromInvoice(invoice, deps.config), {
    chain: deps.config.chain,
    source: deps.config.circleWallet,
    approvedRecipients: new Set([invoice.recipient.toLowerCase()]),
    paidInvoiceIds,
    maxAmountUsdcMicros: deps.config.maxAmountUsdcMicros,
  });
  if (decision.status === "rejected") {
    throw rejectionError(decision.reason);
  }
  return decision.intent;
}

function intentFromInvoice(
  invoice: Invoice,
  config: ServiceConfig,
): PaymentIntent {
  return {
    id: randomUUID() as Uuid,
    invoiceId: invoice.id,
    chain: invoice.chain,
    source: config.circleWallet,
    recipient: invoice.recipient,
    amountUsdcMicros: invoice.amountUsdcMicros,
  };
}

async function loadInvoice(store: InvoiceStore, invoiceId: string) {
  const id = validateId(invoiceId, "invoice_id");
  const invoice = await store.get(id);
  if (!invoice) {
    throw new PaymentServiceError("not_found", "Invoice not found", 404);
  }
  if (!invoice.approved) {
    throw new PaymentServiceError(
      "unapproved_invoice",
      "Invoice is not approved for payment",
      403,
    );
  }
  return invoice;
}

function storeJournal(
  store: PaymentStore,
  explorer: (txHash: HexHash) => string,
  now: () => Date,
): SettlementJournal {
  return {
    async begin(intent) {
      const timestamp = now().toISOString();
      return store.insertInProgress({
        id: intent.id,
        invoiceId: intent.invoiceId,
        status: "in_progress",
        chain: intent.chain,
        source: intent.source,
        recipient: intent.recipient,
        amountUsdcMicros: intent.amountUsdcMicros,
        policyDecision: {
          status: "approved",
          invoiceId: intent.invoiceId,
          paymentId: intent.id,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    async confirm(receipt) {
      const current = await store.getByPaymentId(receipt.intentId);
      if (!current) {
        throw new Error(`Payment ${receipt.intentId} is missing from the journal`);
      }
      await store.save(
        applyReceipt(current, receipt, now().toISOString(), explorer),
      );
    },
    async unresolved(intentId, details) {
      const current = await store.getByPaymentId(intentId);
      if (!current) {
        return;
      }
      await store.save({
        ...current,
        status: "unresolved",
        provider: details.receipt?.provider ?? current.provider,
        providerId: details.receipt?.providerId ?? current.providerId,
        providerStatus: details.receipt?.providerStatus ?? current.providerStatus,
        providerPayload: details.receipt?.providerPayload ?? current.providerPayload,
        txHash: details.receipt?.txHash ?? current.txHash,
        error: details.error,
        updatedAt: now().toISOString(),
      });
    },
    getByPaymentId: (id) => store.getByPaymentId(id).then(toJournalRecord),
    getByInvoiceId: (id) => store.getByInvoiceId(id).then(toJournalRecord),
    claimedInvoiceIds: () => store.claimedInvoiceIds(),
  };
}

function toJournalRecord(record: PaymentRecord | undefined) {
  if (!record) {
    return undefined;
  }
  if (record.status === "confirmed") {
    return {
      status: "confirmed" as const,
      receipt: {
        intentId: record.id,
        provider: record.provider ?? "circle-agent-wallet",
        status: "confirmed" as const,
        txHash: record.txHash,
        providerId: record.providerId,
        providerStatus: record.providerStatus,
        providerPayload: record.providerPayload,
      },
    };
  }
  if (record.status === "in_progress") {
    return {
      status: "in_progress" as const,
      intent: toApprovedIntent(record),
    };
  }
  return {
    status: "unresolved" as const,
    intentId: record.id,
    error: record.error,
    receipt: record.provider
      ? {
          intentId: record.id,
          provider: record.provider,
          status: "unresolved" as const,
          txHash: record.txHash,
          providerId: record.providerId,
          providerStatus: record.providerStatus,
          providerPayload: record.providerPayload,
        }
      : undefined,
  };
}

function toApprovedIntent(record: PaymentRecord): ApprovedPaymentIntent {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    chain: record.chain,
    source: record.source,
    recipient: record.recipient,
    amountUsdcMicros: record.amountUsdcMicros,
  } as ApprovedPaymentIntent;
}

function toResponse(record: PaymentRecord): PaymentResponse {
  return {
    id: record.id,
    paymentId: record.id,
    invoiceId: record.invoiceId,
    status: record.status,
    provider: record.provider,
    providerId: record.providerId,
    txHash: record.txHash,
    arcscanUrl: record.arcscanUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function explorer(baseUrl: string) {
  return (txHash: HexHash) => arcscanUrl(baseUrl, txHash);
}

function validateId(value: string, field: string) {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_ID_LENGTH ||
    [...trimmed].some((char) => char.charCodeAt(0) < 32)
  ) {
    throw new PaymentServiceError("invalid_id", `${field} is invalid`, 400);
  }
  return trimmed;
}

function rejectionError(reason: PolicyRejection) {
  return new PaymentServiceError(reason, policyMessage(reason), 403);
}

function policyMessage(reason: PolicyRejection) {
  switch (reason) {
    case "unapproved_recipient":
      return "Recipient is not on the application allowlist";
    case "duplicate_invoice":
      return "Invoice has already been claimed";
    case "amount_out_of_bounds":
      return "Amount is outside the configured limit";
    case "wrong_chain":
      return "Invoice chain does not match the payment policy";
    case "wrong_source":
      return "Source wallet does not match the payment policy";
    default:
      return "Payment was rejected by policy";
  }
}
