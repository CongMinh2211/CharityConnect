-- 007: keep donation money immutable while allowing the admin review state machine.

CREATE OR REPLACE FUNCTION protect_donation_review() RETURNS trigger AS $$
DECLARE
  changed_review BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'donations is append-only and cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.donor_id IS DISTINCT FROM OLD.donor_id
     OR NEW.donor_name IS DISTINCT FROM OLD.donor_name
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.campaign_title IS DISTINCT FROM OLD.campaign_title
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.anonymous IS DISTINCT FROM OLD.anonymous
     OR NEW.honor_consent IS DISTINCT FROM OLD.honor_consent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'donation financial fields are immutable';
  END IF;

  changed_review := NEW.review_reason IS DISTINCT FROM OLD.review_reason
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by;

  IF OLD.status = 'PENDING_REVIEW' AND NEW.status IN ('COMPLETED', 'REJECTED') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status AND changed_review THEN
    RAISE EXCEPTION 'review metadata can only change with a review status transition';
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'donations only allow PENDING_REVIEW to COMPLETED or REJECTED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_donations_immutable ON donations;
DROP TRIGGER IF EXISTS trg_donations_review_protect ON donations;
CREATE TRIGGER trg_donations_review_protect BEFORE UPDATE OR DELETE ON donations
  FOR EACH ROW EXECUTE FUNCTION protect_donation_review();
