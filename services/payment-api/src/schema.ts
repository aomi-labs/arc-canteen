export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  amount_usdc_micros TEXT NOT NULL,
  chain TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  invoice_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'confirmed', 'unresolved')),
  chain TEXT NOT NULL,
  source TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_usdc_micros TEXT NOT NULL,
  policy_decision JSONB NOT NULL,
  provider TEXT,
  provider_id TEXT,
  provider_status TEXT,
  provider_payload JSONB,
  tx_hash TEXT,
  arcscan_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
