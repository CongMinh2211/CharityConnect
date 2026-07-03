-- 006: Cho phép thông báo trong ứng dụng khi người quyên góp hoàn tất một khoản quyên góp

ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN ('CAMPAIGN_APPROVED','MILESTONE_UPDATED','IMPACT_VERIFIED','DONATION_RECEIVED'));
