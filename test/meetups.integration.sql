-- Run after db/meetups.sql. All fixtures roll back; sequence values may advance.
BEGIN;
DO $$
DECLARE buyer INTEGER; seller INTEGER; listing INTEGER; deal INTEGER; tag TEXT:=txid_current()::text;
  deadline TIMESTAMPTZ; confirmed_time TIMESTAMPTZ:=clock_timestamp()+interval '7 days';
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES('k-buyer-'||tag||'@patriots.uttyler.edu','K buyer',true) RETURNING id INTO buyer;
  INSERT INTO users(email,display_name,verified) VALUES('k-seller-'||tag||'@patriots.uttyler.edu','K seller',true) RETURNING id INTO seller;
  IF (SELECT meetup_availability FROM users WHERE id=seller)<>'[]'::jsonb THEN RAISE EXCEPTION 'Default schedule not empty'; END IF;
  UPDATE users SET meetup_availability='[{"day":3,"start":"17:00","end":"21:00"}]' WHERE id=seller;
  IF (SELECT meetup_availability FROM users WHERE id=buyer)<>'[]'::jsonb THEN RAISE EXCEPTION 'Availability leaked to another account'; END IF;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,status) VALUES(seller,'K fixture','other','good',1000,'reserved') RETURNING id INTO listing;
  INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,item_snapshot) VALUES(listing,buyer,seller,1000,buyer,'{}') RETURNING id INTO deal;
  UPDATE marketplace_deals SET status='reserved',revision=revision+1 WHERE id=deal;
  SELECT reservation_expires_at INTO deadline FROM marketplace_deals WHERE id=deal;
  IF deadline IS NULL OR abs(extract(epoch FROM deadline-clock_timestamp())-172800)>5 THEN RAISE EXCEPTION 'Initial deadline incorrect'; END IF;
  UPDATE marketplace_deals SET meetup_at=confirmed_time,meetup_spot='University Center',meetup_by=buyer,revision=revision+1 WHERE id=deal;
  IF (SELECT reservation_expires_at FROM marketplace_deals WHERE id=deal) IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'Unconfirmed proposal extended deadline'; END IF;
  UPDATE marketplace_deals SET meetup_confirmed=true,revision=revision+1 WHERE id=deal;
  IF (SELECT reservation_expires_at FROM marketplace_deals WHERE id=deal) IS DISTINCT FROM confirmed_time+interval '24 hours' THEN RAISE EXCEPTION 'Confirmed meetup deadline incorrect'; END IF;
  IF uni_expire_reservations(listing)<>0 THEN RAISE EXCEPTION 'Future deadline expired'; END IF;
  UPDATE marketplace_deals SET meetup_confirmed=false,meetup_at=confirmed_time+interval '1 day',revision=revision+1 WHERE id=deal;
  IF (SELECT reservation_expires_at FROM marketplace_deals WHERE id=deal)>clock_timestamp()+interval '48 hours' THEN RAISE EXCEPTION 'Reschedule prolonged unconfirmed hold'; END IF;
  UPDATE marketplace_deals SET meetup_confirmed=true,revision=revision+1 WHERE id=deal;
  UPDATE marketplace_deals SET reservation_expires_at=clock_timestamp()-interval '1 second',buyer_confirmed=true,revision=revision+1 WHERE id=deal;
  IF uni_expire_reservations(listing)<>0 THEN RAISE EXCEPTION 'Partial handover expired'; END IF;
  IF (SELECT status FROM listings WHERE id=listing)<>'reserved' THEN RAISE EXCEPTION 'Partial handover released listing'; END IF;
  -- Reset the fixture to an untouched handover to exercise the worker.
  UPDATE marketplace_deals SET buyer_confirmed=false,revision=revision+1 WHERE id=deal;
  IF uni_expire_reservations(listing)<>1 THEN RAISE EXCEPTION 'Expected expired reservation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM marketplace_deals WHERE id=deal AND status='cancelled' AND expired_at IS NOT NULL) THEN RAISE EXCEPTION 'Expiry history missing'; END IF;
  IF (SELECT status FROM listings WHERE id=listing)<>'active' THEN RAISE EXCEPTION 'Listing not released'; END IF;
  IF uni_expire_reservations(listing)<>0 THEN RAISE EXCEPTION 'Repeated expiration not idempotent'; END IF;
  IF (SELECT count(*) FROM notifications n JOIN marketplace_deals d ON d.id=deal WHERE n.target_id=deal AND n.kind='transactions' AND n.event_key='deal:'||d.id||':'||d.revision AND n.user_id IN (buyer,seller))<>2 THEN RAISE EXCEPTION 'Expiration notifications missing'; END IF;
  RAISE NOTICE 'Weekly availability, reservation deadlines, handover protection and expiration passed';
END $$;
ROLLBACK;
