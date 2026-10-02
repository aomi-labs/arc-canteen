import {
  isHexAddress,
  type ArcChain,
  type HexAddress,
} from "@arc-canteen/payment-core";

export type Invoice = {
  id: string;
  recipient: HexAddress;
  amountUsdcMicros: bigint;
  chain: ArcChain;
  approved: boolean;
};

export interface InvoiceStore {
  get(id: string): Promise<Invoice | undefined>;
  upsert(invoice: Invoice): Promise<void>;
}

export class InMemoryInvoiceStore implements InvoiceStore {
  private readonly invoices = new Map<string, Invoice>();

  constructor(seed: readonly Invoice[] = []) {
    for (const invoice of seed) {
      this.invoices.set(invoice.id, invoice);
    }
  }

  async get(id: string) {
    return this.invoices.get(id);
  }

  async upsert(invoice: Invoice) {
    this.invoices.set(invoice.id, invoice);
  }
}

export function parseInvoiceFixtures(
  raw: string | undefined,
  fallbackChain: ArcChain,
): Invoice[] {
  if (!raw?.trim()) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("APPROVED_INVOICES_JSON must be an array");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invoice fixture ${index} is invalid`);
    }
    const value = entry as {
      id?: unknown;
      recipient?: unknown;
      amountUsdcMicros?: unknown;
      chain?: unknown;
      approved?: unknown;
    };
    if (typeof value.id !== "string" || value.id.trim().length === 0) {
      throw new Error(`Invoice fixture ${index} is missing id`);
    }
    if (typeof value.recipient !== "string" || !isHexAddress(value.recipient)) {
      throw new Error(`Invoice fixture ${index} has an invalid recipient`);
    }
    const amount = BigInt(String(value.amountUsdcMicros ?? "0"));
    if (amount <= 0n) {
      throw new Error(`Invoice fixture ${index} has an invalid amount`);
    }
    const chain = (value.chain ?? fallbackChain) as ArcChain;
    if (chain !== "ARC-TESTNET" && chain !== "ARC") {
      throw new Error(`Invoice fixture ${index} has an invalid chain`);
    }
    return {
      id: value.id,
      recipient: value.recipient,
      amountUsdcMicros: amount,
      chain,
      approved: value.approved !== false,
    };
  });
}
