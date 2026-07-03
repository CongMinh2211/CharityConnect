CREATE TYPE milestone_status AS ENUM ('PLANNED','IN_PROGRESS','SUBMITTED','VERIFIED','DELAYED');

CREATE TABLE campaign_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  planned_amount BIGINT NOT NULL CHECK (planned_amount > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_date DATE NOT NULL,
  target_amount BIGINT NOT NULL CHECK (target_amount > 0),
  status milestone_status NOT NULL DEFAULT 'PLANNED',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE impact_reports ADD COLUMN milestone_id UUID REFERENCES campaign_milestones(id);

CREATE TABLE impact_report_allocations (
  report_id UUID NOT NULL REFERENCES impact_reports(id) ON DELETE CASCADE,
  budget_item_id UUID NOT NULL REFERENCES campaign_budget_items(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  PRIMARY KEY(report_id,budget_item_id)
);

INSERT INTO campaign_budget_items(campaign_id,label,planned_amount,sort_order)
SELECT id,'Ngân sách tổng',goal_amount,0 FROM campaigns
WHERE NOT EXISTS (SELECT 1 FROM campaign_budget_items b WHERE b.campaign_id=campaigns.id);

INSERT INTO campaign_milestones(campaign_id,title,description,target_date,target_amount,status,sort_order)
SELECT id,'Hoàn thành mục tiêu chiến dịch','Mốc tương thích cho dữ liệu được tạo trước migration 004',end_date::date,goal_amount,
       CASE WHEN status='CLOSED' THEN 'VERIFIED'::milestone_status ELSE 'PLANNED'::milestone_status END,0
FROM campaigns
WHERE NOT EXISTS (SELECT 1 FROM campaign_milestones m WHERE m.campaign_id=campaigns.id);

UPDATE impact_reports ir SET milestone_id=(SELECT m.id FROM campaign_milestones m WHERE m.campaign_id=ir.campaign_id ORDER BY sort_order LIMIT 1)
WHERE milestone_id IS NULL;

INSERT INTO impact_report_allocations(report_id,budget_item_id,amount)
SELECT ir.id,(SELECT b.id FROM campaign_budget_items b WHERE b.campaign_id=ir.campaign_id ORDER BY sort_order LIMIT 1),ir.amount_used
FROM impact_reports ir ON CONFLICT DO NOTHING;

CREATE INDEX idx_budget_campaign ON campaign_budget_items(campaign_id,sort_order);
CREATE INDEX idx_milestone_campaign ON campaign_milestones(campaign_id,sort_order);
CREATE INDEX idx_milestone_overdue ON campaign_milestones(target_date,status);
CREATE INDEX idx_allocations_budget ON impact_report_allocations(budget_item_id);
