-- Duyệt 2 bước theo ngưỡng tiền + opt-in vinh danh.
-- Khoản lớn (>= ngưỡng) vào PENDING_REVIEW, chỉ cộng tiền/ghi sổ cái khi admin duyệt.
ALTER TYPE donation_status ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE donation_status ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE donations ADD COLUMN IF NOT EXISTS honor_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reviewed_by UUID;

CREATE INDEX IF NOT EXISTS idx_donations_pending ON donations(created_at) WHERE status = 'PENDING_REVIEW';
