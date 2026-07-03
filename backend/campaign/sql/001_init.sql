CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE campaign_status AS ENUM ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','CLOSED');
CREATE TYPE campaign_category AS ENUM ('EMERGENCY','EDUCATION','HEALTH','ENVIRONMENT','COMMUNITY');

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  organization_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category campaign_category NOT NULL,
  goal_amount BIGINT NOT NULL CHECK (goal_amount > 0),
  raised_amount BIGINT NOT NULL DEFAULT 0 CHECK (raised_amount >= 0),
  image_path TEXT,
  end_date TIMESTAMPTZ NOT NULL,
  status campaign_status NOT NULL DEFAULT 'DRAFT',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > created_at)
);

CREATE TABLE processed_donation_events (
  event_id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  amount BIGINT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_public ON campaigns(status,end_date DESC);
CREATE INDEX idx_campaign_org ON campaigns(organization_id,created_at DESC);
CREATE INDEX idx_campaign_review ON campaigns(status,submitted_at ASC);

