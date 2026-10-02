import type {
  ApprovedPaymentIntent,
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
}

export class InMemorySettlementJournal implements SettlementJournal {
  private readonly records = new Map<Uuid, JournalRecord>();
  private readonly invoiceClaims = new Set<string>();

  async begin(intent: ApprovedPaymentIntent) {
    if (
      this.records.has(intent.id) ||
      this.invoiceClaims.has(intent.invoiceId)
    ) {
      return false;
    }
    this.records.set(intent.id, { status: "in_progress", intent });
    this.invoiceClaims.add(intent.invoiceId);
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
