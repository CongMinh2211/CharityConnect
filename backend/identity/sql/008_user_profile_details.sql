-- Thông tin liên hệ riêng tư của tài khoản. Các cột này không được đưa vào
-- campaign public, receipt công khai hoặc TrustChain/hash-chain.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS organization_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_province ON users(province) WHERE province IS NOT NULL;
