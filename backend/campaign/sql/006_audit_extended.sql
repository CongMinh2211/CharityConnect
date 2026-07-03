-- 006: Audit mở rộng — role, lý do, IP, user agent
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
