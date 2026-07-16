-- Hồ sơ xác minh tổ chức: thời hạn hiệu lực của trạng thái đã xác minh.
-- Ngày duyệt dùng reviewed_at sẵn có; lịch sử thay đổi lấy từ audit_logs (ORGANIZATION_*).
ALTER TABLE organization_profiles ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

-- Backfill hồ sơ đã xác minh trước migration để không vô hiệu hóa tổ chức hợp lệ
-- khi endpoint nội bộ chuyển sang kiểm tra thời hạn theo nguyên tắc fail-closed.
UPDATE organization_profiles
SET verification_expires_at=COALESCE(reviewed_at,now())+interval '1 year'
WHERE status='VERIFIED' AND verification_expires_at IS NULL;
