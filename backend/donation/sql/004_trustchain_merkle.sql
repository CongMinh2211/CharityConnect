CREATE TABLE IF NOT EXISTS ledger_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merkle_root CHAR(64) NOT NULL,
  from_position BIGINT NOT NULL,
  to_position BIGINT NOT NULL,
  network TEXT NOT NULL,
  anchor_tx_hash TEXT NOT NULL,
  block_number BIGINT,
  explorer_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('SIMULATED','PENDING','CONFIRMED','FAILED')),
  created_by UUID,
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  last_error TEXT,
  CHECK (from_position > 0 AND to_position >= from_position),
  UNIQUE(from_position,to_position)
);

CREATE TABLE IF NOT EXISTS anchor_entries (
  anchor_id UUID NOT NULL REFERENCES ledger_anchors(id) ON DELETE CASCADE,
  ledger_position BIGINT PRIMARY KEY REFERENCES ledger_entries(position),
  leaf_index INTEGER NOT NULL CHECK (leaf_index >= 0),
  merkle_proof JSONB NOT NULL,
  UNIQUE(anchor_id,leaf_index)
);

CREATE INDEX IF NOT EXISTS idx_ledger_anchors_latest ON ledger_anchors(anchored_at DESC);

