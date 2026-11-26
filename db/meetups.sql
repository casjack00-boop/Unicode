-- Apply after personalisation.sql. Existing reservations receive a grace period.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS meetup_availability JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_deals ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
UPDATE marketplace_deals SET reservation_expires_at = GREATEST(clock_timestamp()+interval '48 hours',
  CASE WHEN meetup_confirmed THEN meetup_at+interval '24 hours' END)
  WHERE status='reserved' AND reservation_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_expiration_idx ON marketplace_deals(reservation_expires_at,listing_id)
  WHERE status='reserved' AND NOT buyer_confirmed AND NOT seller_confirmed;

CREATE OR REPLACE FUNCTION uni_reservation_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'reserved' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    NEW.reservation_expires_at := COALESCE(NEW.reservation_expires_at,clock_timestamp()+interval '48 hours');
  ELSIF OLD.status <> 'reserved' THEN
    NEW.reservation_expires_at := clock_timestamp()+interval '48 hours';
  ELSIF NEW.meetup_confirmed AND NOT OLD.meetup_confirmed THEN
    NEW.reservation_expires_at := NEW.meetup_at+interval '24 hours';
  ELSIF OLD.meetup_confirmed AND NOT NEW.meetup_confirmed THEN
    NEW.reservation_expires_at := LEAST(OLD.reservation_expires_at,clock_timestamp()+interval '48 hours');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_reservation_deadline_guard ON marketplace_deals;
CREATE TRIGGER uni_reservation_deadline_guard BEFORE INSERT OR UPDATE ON marketplace_deals
  FOR EACH ROW EXECUTE FUNCTION uni_reservation_deadline();

-- Lock listings before deals, matching the transaction route. Recheck eligibility
-- after locking; concurrent confirmation/cancellation wins if it already committed.
CREATE OR REPLACE FUNCTION uni_expire_reservations(target_listing INTEGER DEFAULT NULL) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE candidate RECORD; changed INTEGER; total INTEGER := 0;
BEGIN
  FOR candidate IN SELECT l.id FROM listings l
    WHERE (target_listing IS NULL OR l.id=target_listing) AND EXISTS (
      SELECT 1 FROM marketplace_deals d WHERE d.listing_id=l.id AND d.status='reserved'
      AND NOT d.buyer_confirmed AND NOT d.seller_confirmed AND d.reservation_expires_at<=clock_timestamp())
    ORDER BY l.id LIMIT 100 FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE marketplace_deals SET status='cancelled', expired_at=clock_timestamp(), revision=revision+1, updated_at=clock_timestamp()
      WHERE listing_id=candidate.id AND status='reserved' AND NOT buyer_confirmed AND NOT seller_confirmed
        AND reservation_expires_at<=clock_timestamp();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed>0 THEN
      UPDATE listings SET status='active' WHERE id=candidate.id AND status='reserved';
      total := total+changed;
    END IF;
  END LOOP;
  RETURN total;
END; $$;
COMMIT;
