ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check
  CHECK (template IN ('WELCOME','DONATION_THANK_YOU','CAMPAIGN_UPDATE'));

CREATE TABLE IF NOT EXISTS campaign_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  saved BOOLEAN NOT NULL DEFAULT FALSE,
  following BOOLEAN NOT NULL DEFAULT FALSE,
  campaign_title TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,campaign_id),
  CHECK (saved OR following)
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CAMPAIGN_APPROVED','MILESTONE_UPDATED','IMPACT_VERIFIED')),
  campaign_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  path TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_id)
);

CREATE TABLE IF NOT EXISTS processed_campaign_notification_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preferences_user ON campaign_preferences(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preferences_following ON campaign_preferences(campaign_id) WHERE following;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON user_notifications(user_id,created_at DESC) WHERE read_at IS NULL;
