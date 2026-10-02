import {
  isHexAddress,
  isHexHash,
  isUuid,
  type ArcChain,
  type HexAddress,
  type HexHash,
  type JsonValue,
  type SettlementReceipt,
  type Uuid,
} from "@arc-canteen/payment-core";

export type PaymentStatus = "in_progress" | "confirmed" | "unresolved";

export type PaymentRecord = {
  id: Uuid;
  invoiceId: string;
  status: PaymentStatus;
  chain: ArcChain;
  source: HexAddress;
  recipient: HexAddress;
  amountUsdcMicros: bigint;
  policyDecision: JsonValue;
  provider?: SettlementReceipt["provider"];
  providerId?: string;
  providerStatus?: string;
  providerPayload?: JsonValue;
  txHash?: HexHash;
  arcscanUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export interface PaymentStore {
  getByPaymentId(id: string): Promise<PaymentRecord | undefined>;
  getByInvoiceId(invoiceId: string): Promise<PaymentRecord | undefined>;
  claimedInvoiceIds(): Promise<ReadonlySet<string>>;
  insertInProgress(record: PaymentRecord): Promise<boolean>;
  save(record: PaymentRecord): Promise<void>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly byId = new Map<string, PaymentRecord>();
  private readonly byInvoice = new Map<string, string>();

  async getByPaymentId(id: string) {
    return this.byId.get(id);
  }

  async getByInvoiceId(invoiceId: string) {
    const id = this.byInvoice.get(invoiceId);
    return id ? this.byId.get(id) : undefined;
  }

  async claimedInvoiceIds() {
    return new Set(this.byInvoice.keys());
  }

  async insertInProgress(record: PaymentRecord) {
    if (this.byId.has(record.id) || this.byInvoice.has(record.invoiceId)) {
      return false;
    }
    this.byId.set(record.id, record);
    this.byInvoice.set(record.invoiceId, record.id);
    return true;
  }

  async save(record: PaymentRecord) {
    this.byId.set(record.id, record);
    this.byInvoice.set(record.invoiceId, record.id);
  }
}

export function applyReceipt(
  record: PaymentRecord,
  receipt: SettlementReceipt,
  now: string,
  explorer: (txHash: HexHash) => string,
): PaymentRecord {
  return {
    ...record,
    status: receipt.status,
    provider: receipt.provider,
    providerId: receipt.providerId,
    providerStatus: receipt.providerStatus,
    providerPayload: receipt.providerPayload,
    txHash: receipt.txHash,
    arcscanUrl: receipt.txHash ? explorer(receipt.txHash) : record.arcscanUrl,
    error: receipt.status === "confirmed" ? undefined : record.error,
    updatedAt: now,
  };
}

export type PaymentRow = {
  id: string;
  invoice_id: string;
  status: string;
  chain: string;
  source: string;
  recipient: string;
  amount_usdc_micros: string;
  policy_decision: JsonValue;
  provider?: string | null;
  provider_id?: string | null;
  provider_status?: string | null;
  provider_payload?: JsonValue | null;
  tx_hash?: string | null;
  arcscan_url?: string | null;
  error?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export function recordFromRow(row: PaymentRow): PaymentRecord {
  if (!isUuid(row.id) || !isHexAddress(row.source) || !isHexAddress(row.recipient)) {
    throw new Error("payment row failed validation");
  }
  const txHash = row.tx_hash && isHexHash(row.tx_hash) ? row.tx_hash : undefined;
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    status: row.status as PaymentStatus,
    chain: row.chain as ArcChain,
    source: row.source,
    recipient: row.recipient,
    amountUsdcMicros: BigInt(row.amount_usdc_micros),
    policyDecision: row.policy_decision,
    provider: (row.provider ?? undefined) as PaymentRecord["provider"],
    providerId: row.provider_id ?? undefined,
    providerStatus: row.provider_status ?? undefined,
    providerPayload: row.provider_payload ?? undefined,
    txHash,
    arcscanUrl: row.arcscan_url ?? undefined,
    error: row.error ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}
