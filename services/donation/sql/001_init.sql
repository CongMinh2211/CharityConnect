CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE donation_status AS ENUM ('COMPLETED','FAILED');

CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL,
  donor_name TEXT NOT NULL,
  campaign_id UUID NOT NULL,
  campaign_title TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  anonymous BOOLEAN NOT NULL DEFAULT false,
  status donation_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  donation_id UUID NOT NULL UNIQUE REFERENCES donations(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_donations_donor ON donations(donor_id,created_at DESC);
CREATE INDEX idx_donations_campaign ON donations(campaign_id,created_at DESC);
CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;

