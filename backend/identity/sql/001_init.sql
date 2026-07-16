CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('DONOR', 'ORGANIZATION', 'ADMIN');
CREATE TYPE organization_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  document_path TEXT,
  status organization_status NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_status ON organization_profiles(status);
CREATE INDEX idx_identity_audit_created_at ON audit_logs(created_at DESC);

-- Admin production được bootstrap từ ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD sau migration.
-- Không lưu mật khẩu mặc định trong SQL hoặc Git.
