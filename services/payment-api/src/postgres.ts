import { Pool, type PoolConfig, type QueryResultRow } from "pg";
import type { Invoice, InvoiceStore } from "./invoices";
import {
  recordFromRow,
  type PaymentRecord,
  type PaymentRow,
  type PaymentStore,
} from "./store";
import { SCHEMA_SQL } from "./schema";

export interface SqlClient {
  query<T = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

const UNIQUE_VIOLATION = "23505";

export function createPool(connectionString: string): Pool {
  const config: PoolConfig = {
    connectionString,
    max: 5,
  };
  if (/sslmode=require/i.test(connectionString) || process.env.DATABASE_SSL === "true") {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Pool(config);
}

export async function migrate(client: SqlClient) {
  await client.query(SCHEMA_SQL);
}

export class PostgresInvoiceStore implements InvoiceStore {
  constructor(private readonly client: SqlClient) {}

  async get(id: string) {
    const result = await this.client.query<{
      id: string;
      recipient: string;
      amount_usdc_micros: string;
      chain: Invoice["chain"];
      approved: boolean;
    }>(
      `SELECT id, recipient, amount_usdc_micros, chain, approved
       FROM invoices
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      recipient: row.recipient as Invoice["recipient"],
      amountUsdcMicros: BigInt(row.amount_usdc_micros),
      chain: row.chain,
      approved: row.approved,
    };
  }

  async upsert(invoice: Invoice) {
    await this.client.query(
      `INSERT INTO invoices (id, recipient, amount_usdc_micros, chain, approved)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         recipient = EXCLUDED.recipient,
         amount_usdc_micros = EXCLUDED.amount_usdc_micros,
         chain = EXCLUDED.chain,
         approved = EXCLUDED.approved`,
      [
        invoice.id,
        invoice.recipient,
        invoice.amountUsdcMicros.toString(),
        invoice.chain,
        invoice.approved,
      ],
    );
  }
}

export class PostgresPaymentStore implements PaymentStore {
  constructor(private readonly client: SqlClient) {}

  async getByPaymentId(id: string) {
    const result = await this.client.query<PaymentRow>(SELECT_PAYMENT, [id]);
    return result.rows[0] ? recordFromRow(result.rows[0]) : undefined;
  }

  async getByInvoiceId(invoiceId: string) {
    const result = await this.client.query<PaymentRow>(
      `${SELECT_PAYMENT_BASE} WHERE invoice_id = $1`,
      [invoiceId],
    );
    return result.rows[0] ? recordFromRow(result.rows[0]) : undefined;
  }

  async claimedInvoiceIds() {
    const result = await this.client.query<{ invoice_id: string }>(
      `SELECT invoice_id FROM payments`,
    );
    return new Set(result.rows.map((row) => row.invoice_id));
  }

  async insertInProgress(record: PaymentRecord) {
    try {
      await this.client.query(
        `INSERT INTO payments (
           id, invoice_id, status, chain, source, recipient, amount_usdc_micros,
           policy_decision, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.invoiceId,
          record.status,
          record.chain,
          record.source,
          record.recipient,
          record.amountUsdcMicros.toString(),
          record.policyDecision,
          record.createdAt,
          record.updatedAt,
        ],
      );
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async save(record: PaymentRecord) {
    await this.client.query(
      `UPDATE payments SET
         status = $2,
         provider = $3,
         provider_id = $4,
         provider_status = $5,
         provider_payload = $6,
         tx_hash = $7,
         arcscan_url = $8,
         error = $9,
         updated_at = $10
       WHERE id = $1`,
      [
        record.id,
        record.status,
        record.provider ?? null,
        record.providerId ?? null,
        record.providerStatus ?? null,
        record.providerPayload ?? null,
        record.txHash ?? null,
        record.arcscanUrl ?? null,
        record.error ?? null,
        record.updatedAt,
      ],
    );
  }
}

const SELECT_PAYMENT_BASE = `
  SELECT id, invoice_id, status, chain, source, recipient, amount_usdc_micros,
         policy_decision, provider, provider_id, provider_status, provider_payload,
         tx_hash, arcscan_url, error, created_at, updated_at
  FROM payments
`;

const SELECT_PAYMENT = `${SELECT_PAYMENT_BASE} WHERE id = $1`;

export function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === UNIQUE_VIOLATION,
  );
}
