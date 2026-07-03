CREATE INDEX IF NOT EXISTS idx_donations_created_completed
  ON donations(created_at DESC) WHERE status='COMPLETED';
CREATE INDEX IF NOT EXISTS idx_ledger_created_event
  ON ledger_entries(created_at DESC,event_type);

