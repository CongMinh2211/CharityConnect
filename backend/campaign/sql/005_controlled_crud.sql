ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE impact_reports
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TYPE impact_report_status ADD VALUE IF NOT EXISTS 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_campaign_org_active
  ON campaigns(organization_id,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_impact_report_active
  ON impact_reports(campaign_id,status,created_at DESC)
  WHERE deleted_at IS NULL;

