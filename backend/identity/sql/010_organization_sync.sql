ALTER TABLE organization_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE organization_profiles
SET updated_at = COALESCE(reviewed_at, submitted_at, now())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_status_updated
  ON organization_profiles(status, updated_at DESC);
