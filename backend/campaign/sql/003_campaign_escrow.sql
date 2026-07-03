CREATE TABLE IF NOT EXISTS campaign_escrows (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  total_donated BIGINT NOT NULL DEFAULT 0 CHECK (total_donated >= 0),
  released_amount BIGINT NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  locked_amount BIGINT NOT NULL DEFAULT 0 CHECK (locked_amount >= 0),
  contract_state TEXT NOT NULL DEFAULT 'CREATED' CHECK (contract_state IN (
    'CREATED','APPROVED','DONATION_OPEN','FUND_LOCKED','USAGE_SUBMITTED','USAGE_VERIFIED','FUND_RELEASED','CLOSED'
  )),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (released_amount + locked_amount = total_donated)
);

CREATE TABLE IF NOT EXISTS escrow_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  amount BIGINT,
  source_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_event_id,state)
);

INSERT INTO campaign_escrows(campaign_id,total_donated,released_amount,locked_amount,contract_state)
SELECT c.id,c.raised_amount,
       LEAST(c.raised_amount,COALESCE((SELECT sum(ir.amount_used) FROM impact_reports ir WHERE ir.campaign_id=c.id AND ir.status='VERIFIED'),0)),
       GREATEST(0,c.raised_amount-COALESCE((SELECT sum(ir.amount_used) FROM impact_reports ir WHERE ir.campaign_id=c.id AND ir.status='VERIFIED'),0)),
       CASE WHEN c.status='CLOSED' THEN 'CLOSED' WHEN c.status='APPROVED' THEN 'DONATION_OPEN' ELSE 'CREATED' END
FROM campaigns c ON CONFLICT(campaign_id) DO NOTHING;

