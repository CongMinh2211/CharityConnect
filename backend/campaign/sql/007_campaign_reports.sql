-- Báo cáo chiến dịch đáng ngờ: người dân gửi báo cáo, nhận mã tiếp nhận, tra cứu
-- kết quả xử lý công khai. Admin phân loại và ghi kết quả.
CREATE TABLE IF NOT EXISTS campaign_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reporter_email TEXT,
  category TEXT NOT NULL CHECK (category IN ('FRAUD','MISUSE','FAKE_INFO','DUPLICATE','OTHER')),
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','REVIEWING','RESOLVED','DISMISSED')),
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);
CREATE INDEX IF NOT EXISTS idx_campaign_reports_campaign ON campaign_reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_reports_open ON campaign_reports(created_at) WHERE status IN ('RECEIVED','REVIEWING');
