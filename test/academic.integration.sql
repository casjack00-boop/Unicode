-- Rollback-only test. Run after all migrations through academic.sql.
BEGIN;
DO $$
DECLARE buyer INTEGER; seller INTEGER; wanted textbook_requests; book listings; wrong listings; tag TEXT := txid_current()::text;
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES('academic-buyer-'||tag||'@patriots.uttyler.edu','Academic test buyer',true) RETURNING id INTO buyer;
  INSERT INTO users(email,display_name,verified) VALUES('academic-seller-'||tag||'@patriots.uttyler.edu','Academic test seller',true) RETURNING id INTO seller;
  INSERT INTO textbook_requests(user_id,title,isbn,max_price_cents) VALUES(buyer,'Clean Code','9780132350884',3000) RETURNING * INTO wanted;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,isbn) VALUES(seller,'Clean Code','textbooks','good',2500,'9780132350884') RETURNING * INTO book;
  IF uni_textbook_match(wanted,book) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Matching ISBN rejected'; END IF;
  IF NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND event_key='match:'||book.id) THEN RAISE EXCEPTION 'Matching alert missing'; END IF;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,isbn) VALUES(seller,'Clean Code','textbooks','good',4000,'9780132350884') RETURNING * INTO wrong;
  IF uni_textbook_match(wanted,wrong) IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Budget ignored'; END IF;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND event_key='match:'||wrong.id) THEN RAISE EXCEPTION 'Over-budget alert created'; END IF;
  INSERT INTO notification_preferences(user_id,saved_searches) VALUES(buyer,false);
  INSERT INTO listings(seller_id,title,category,condition,price_cents,isbn) VALUES(seller,'Clean Code','textbooks','good',2000,'9780132350884') RETURNING * INTO wrong;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND event_key='match:'||wrong.id) THEN RAISE EXCEPTION 'Disabled preference ignored'; END IF;
  UPDATE notification_preferences SET saved_searches=true WHERE user_id=buyer;
  INSERT INTO user_blocks(blocker_id,blocked_id) VALUES(buyer,seller);
  INSERT INTO listings(seller_id,title,category,condition,price_cents,isbn) VALUES(seller,'Clean Code','textbooks','good',2000,'9780132350884') RETURNING * INTO wrong;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND event_key='match:'||wrong.id) THEN RAISE EXCEPTION 'Blocked seller alert created'; END IF;
  DELETE FROM user_blocks WHERE blocker_id=buyer AND blocked_id=seller;
  UPDATE textbook_requests SET status='closed' WHERE id=wanted.id;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,isbn) VALUES(seller,'Clean Code','textbooks','good',2000,'9780132350884') RETURNING * INTO wrong;
  IF EXISTS(SELECT 1 FROM notifications WHERE user_id=buyer AND event_key='match:'||wrong.id) THEN RAISE EXCEPTION 'Closed request still generates alerts'; END IF;
  RAISE NOTICE 'Academic matching and notifications passed';
END $$;
ROLLBACK;
