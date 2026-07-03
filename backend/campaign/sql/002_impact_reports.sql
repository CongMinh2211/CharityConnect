CREATE TYPE impact_report_status AS ENUM ('PENDING_REVIEW','VERIFIED','REJECTED');

CREATE TABLE impact_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_used BIGINT NOT NULL CHECK (amount_used > 0),
  report_date DATE NOT NULL,
  status impact_report_status NOT NULL DEFAULT 'PENDING_REVIEW',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE impact_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES impact_reports(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_impact_campaign_public ON impact_reports(campaign_id, status, report_date DESC);
CREATE INDEX idx_impact_review ON impact_reports(status, submitted_at);
CREATE INDEX idx_impact_evidence_report ON impact_evidence(report_id);
CREATE INDEX idx_campaign_outbox_pending ON campaign_outbox_events(created_at) WHERE published_at IS NULL;
