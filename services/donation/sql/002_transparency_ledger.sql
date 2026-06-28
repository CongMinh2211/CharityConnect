CREATE TABLE IF NOT EXISTS ledger_entries (
  position BIGINT PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('DONATION_COMPLETED','FUND_USAGE_VERIFIED')),
  campaign_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  public_payload JSONB NOT NULL,
  previous_hash CHAR(64) NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  entry_hash CHAR(64) NOT NULL UNIQUE CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_campaign_position ON ledger_entries(campaign_id, position DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_event_position ON ledger_entries(event_type, position DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_receipt ON ledger_entries((public_payload->>'receipt_number'))
  WHERE event_type = 'DONATION_COMPLETED';
