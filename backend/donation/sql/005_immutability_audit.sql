-- 005: Bất biến dữ liệu tài chính + audit mở rộng

-- Cấm UPDATE/DELETE trên các bảng append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là append-only, không được % ', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['donations','receipts','ledger_entries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_immutable ON %s', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_immutable BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION forbid_mutation()',
      t, t
    );
  END LOOP;
END $$;

-- ledger_anchors: cho phép UPDATE trạng thái xác nhận (PENDING→CONFIRMED/FAILED) nhưng cấm sửa root/khoảng vị trí và cấm DELETE.
CREATE OR REPLACE FUNCTION protect_anchor() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger_anchors là append-only, không được DELETE';
  END IF;
  IF NEW.merkle_root <> OLD.merkle_root
     OR NEW.from_position <> OLD.from_position
     OR NEW.to_position <> OLD.to_position THEN
    RAISE EXCEPTION 'Không được sửa merkle_root/vị trí của anchor';
  END IF;
  -- tx hash chỉ được ghi đè khi anchor còn PENDING (placeholder → tx Sepolia thật).
  IF NEW.anchor_tx_hash <> OLD.anchor_tx_hash AND OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Không được sửa tx hash của anchor đã chốt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_anchors_protect ON ledger_anchors;
CREATE TRIGGER trg_ledger_anchors_protect BEFORE UPDATE OR DELETE ON ledger_anchors
  FOR EACH ROW EXECUTE FUNCTION protect_anchor();

-- Audit mở rộng (donation service ghi audit khi tạo anchor thủ công).
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_donation_audit_created ON audit_logs(created_at DESC);
