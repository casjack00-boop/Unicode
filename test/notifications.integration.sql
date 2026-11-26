-- Run with psql -v ON_ERROR_STOP=1 -f test/notifications.integration.sql
-- All created test rows roll back. Sequences may advance as normal in PostgreSQL.
BEGIN;
DO $$
DECLARE buyer INTEGER; seller INTEGER; outsider INTEGER; item INTEGER; conv INTEGER; deal INTEGER; token TEXT := txid_current()::text;
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES ('notice-buyer-'||token||'@patriots.uttyler.edu','Notification test buyer',TRUE) RETURNING id INTO buyer;
  INSERT INTO users(email,display_name,verified) VALUES ('notice-seller-'||token||'@patriots.uttyler.edu','Notification test seller',TRUE) RETURNING id INTO seller;
  INSERT INTO users(email,display_name,verified) VALUES ('notice-other-'||token||'@patriots.uttyler.edu','Notification test outsider',TRUE) RETURNING id INTO outsider;
  INSERT INTO saved_searches(user_id,term,category,max_price_cents) VALUES (buyer,'notice-test-'||token,'textbooks',5000),(buyer,'notice-test-'||token,'all',NULL),(outsider,'notice-test-'||token,'furniture',NULL);
  INSERT INTO listings(seller_id,title,price_cents,category,condition) VALUES (seller,'notice-test-'||token,4000,'textbooks','good') RETURNING id INTO item;
  IF (SELECT count(*) FROM notifications WHERE user_id=buyer AND kind='saved_searches' AND target_id=item)<>1 THEN RAISE EXCEPTION 'Expected one deduplicated search alert'; END IF;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id IN (seller,outsider) AND target_id=item) THEN RAISE EXCEPTION 'Unexpected search alert'; END IF;
  INSERT INTO saved_listings(user_id,listing_id) VALUES (buyer,item);
  UPDATE listings SET price_cents=3500 WHERE id=item;
  UPDATE listings SET price_cents=3600 WHERE id=item;
  IF (SELECT count(*) FROM notifications WHERE user_id=buyer AND kind='price_drops' AND target_id=item)<>1 THEN RAISE EXCEPTION 'Expected price drop only'; END IF;
  INSERT INTO notification_preferences(user_id,price_drops) VALUES (buyer,FALSE);
  UPDATE listings SET price_cents=3000 WHERE id=item;
  IF (SELECT count(*) FROM notifications WHERE user_id=buyer AND kind='price_drops' AND target_id=item)<>1 THEN RAISE EXCEPTION 'Price preference ignored'; END IF;
  INSERT INTO conversations(listing_id,buyer_id,seller_id) VALUES (item,buyer,seller) RETURNING id INTO conv;
  INSERT INTO messages(conversation_id,sender_id,body) VALUES (conv,buyer,'Private test message');
  IF (SELECT count(*) FROM notifications WHERE user_id=seller AND kind='messages' AND target_id=conv)<>1 OR EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND kind='messages') THEN RAISE EXCEPTION 'Message recipient wrong'; END IF;
  IF EXISTS(SELECT 1 FROM notifications WHERE body LIKE '%Private test message%') THEN RAISE EXCEPTION 'Message content exposed'; END IF;
  INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,item_snapshot) VALUES(item,buyer,seller,3000,buyer,'{}') RETURNING id INTO deal;
  UPDATE marketplace_deals SET price_cents=2800,proposed_by=seller,revision=revision+1 WHERE id=deal;
  IF (SELECT count(*) FROM notifications WHERE user_id=buyer AND kind='transactions' AND target_id=deal)<>1 THEN RAISE EXCEPTION 'Counteroffer alert missing'; END IF;
  UPDATE marketplace_deals SET status='reserved',revision=revision+1 WHERE id=deal;
  IF (SELECT count(*) FROM notifications WHERE kind='transactions' AND target_id=deal AND user_id IN (buyer,seller))<>4 THEN RAISE EXCEPTION 'Reservation alerts missing'; END IF;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id=outsider) THEN RAISE EXCEPTION 'Outsider received alert'; END IF;
  RAISE NOTICE 'PASS: saved search, deduplication, price drops, preferences, message privacy, offer and reservation recipients';
END;
$$;
ROLLBACK;
