DO $$
BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE','DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS account_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check
  CHECK (template IN ('WELCOME','DONATION_THANK_YOU','CAMPAIGN_UPDATE','PASSWORD_RESET'));

CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status,role);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON account_sessions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON account_sessions(user_id,expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_active ON password_reset_tokens(token_hash,expires_at)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_identity_audit_actor_created ON audit_logs(actor_id,created_at DESC);

