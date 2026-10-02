import type {
  ApprovedPaymentIntent,
  ReconciliationAdapter,
  SettlementAdapter,
  SettlementReceipt,
  Uuid,
} from "./domain";

export type JournalRecord =
  | { status: "in_progress"; intent: ApprovedPaymentIntent }
  | { status: "confirmed"; receipt: SettlementReceipt }
  | {
      status: "unresolved";
      intentId: Uuid;
      receipt?: SettlementReceipt;
      error?: string;
    };

export interface SettlementJournal {
  begin(intent: ApprovedPaymentIntent): Promise<boolean>;
  confirm(receipt: SettlementReceipt): Promise<void>;
  unresolved(
    intentId: Uuid,
    details: { receipt?: SettlementReceipt; error?: string },
  ): Promise<void>;
  getByPaymentId(intentId: Uuid): Promise<JournalRecord | undefined>;
  getByInvoiceId(invoiceId: string): Promise<JournalRecord | undefined>;
  claimedInvoiceIds(): Promise<ReadonlySet<string>>;
}

export class InMemorySettlementJournal implements SettlementJournal {
  private readonly records = new Map<Uuid, JournalRecord>();
  private readonly invoiceClaims = new Map<string, Uuid>();

  async begin(intent: ApprovedPaymentIntent) {
    if (
      this.records.has(intent.id) ||
      this.invoiceClaims.has(intent.invoiceId)
    ) {
      return false;
    }
    this.records.set(intent.id, { status: "in_progress", intent });
    this.invoiceClaims.set(intent.invoiceId, intent.id);
    return true;
  }

  async confirm(receipt: SettlementReceipt) {
    this.records.set(receipt.intentId, { status: "confirmed", receipt });
  }

  async unresolved(
    intentId: Uuid,
    details: { receipt?: SettlementReceipt; error?: string },
  ) {
    this.records.set(intentId, {
      status: "unresolved",
      intentId,
      ...details,
    });
  }

  get(intentId: Uuid) {
    return this.records.get(intentId);
  }

  async getByPaymentId(intentId: Uuid) {
    return this.records.get(intentId);
  }

  async getByInvoiceId(invoiceId: string) {
    const intentId = this.invoiceClaims.get(invoiceId);
    return intentId ? this.records.get(intentId) : undefined;
  }

  async claimedInvoiceIds() {
    return new Set(this.invoiceClaims.keys());
  }
}

export async function settleOnce(
  intent: ApprovedPaymentIntent,
  adapter: SettlementAdapter,
  journal: SettlementJournal,
) {
  const claimed = await journal.begin(intent);
  if (!claimed) {
    throw new Error(
      `Payment ${intent.id} or invoice ${intent.invoiceId} is already claimed`,
    );
  }

  try {
    const receipt = await adapter.settle(intent);
    if (receipt.status === "confirmed") {
      await journal.confirm(receipt);
    } else {
      await journal.unresolved(intent.id, { receipt });
    }
    return receipt;
  } catch (error) {
    await journal.unresolved(intent.id, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function reconcileOnce(
  intent: ApprovedPaymentIntent,
  adapter: ReconciliationAdapter,
  journal: SettlementJournal,
) {
  try {
    const receipt = await adapter.reconcile(intent);
    if (receipt.status === "confirmed") {
      await journal.confirm(receipt);
    } else {
      await journal.unresolved(intent.id, { receipt });
    }
    return receipt;
  } catch (error) {
    await journal.unresolved(intent.id, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
