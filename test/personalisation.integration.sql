-- Run after personalisation.sql. All fixtures roll back; serial sequences may advance.
BEGIN;
DO $$
DECLARE
  buyer INTEGER; other_buyer INTEGER; seller INTEGER; blocked INTEGER; unverified INTEGER;
  purchased INTEGER; old_view INTEGER; fresh_view INTEGER; candidate INTEGER; own_item INTEGER;
  blocked_item INTEGER; unverified_item INTEGER; removed_item INTEGER; reserved_item INTEGER;
  unrelated_view INTEGER; unrelated_candidate INTEGER;
  tag TEXT := txid_current()::text;
  chair TEXT := 'UniJ ergonomic chair '||tag;
  shelf TEXT := 'UniJ oak bookshelf '||tag;
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES('j-buyer-'||tag||'@patriots.uttyler.edu','J buyer',true) RETURNING id INTO buyer;
  INSERT INTO users(email,display_name,verified) VALUES('j-other-'||tag||'@patriots.uttyler.edu','J other',true) RETURNING id INTO other_buyer;
  INSERT INTO users(email,display_name,verified) VALUES('j-seller-'||tag||'@patriots.uttyler.edu','J seller',true) RETURNING id INTO seller;
  INSERT INTO users(email,display_name,verified) VALUES('j-blocked-'||tag||'@patriots.uttyler.edu','J blocked',true) RETURNING id INTO blocked;
  INSERT INTO users(email,display_name,verified) VALUES('j-unverified-'||tag||'@patriots.uttyler.edu','J unverified',false) RETURNING id INTO unverified;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,status,created_at) VALUES(seller,chair,'furniture','good',2000,'sold',now()-interval '2 hours') RETURNING id INTO purchased;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(seller,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO old_view;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(seller,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO fresh_view;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(seller,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO candidate;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(buyer,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO own_item;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(blocked,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO blocked_item;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(unverified,chair,'furniture','good',2000,now()-interval '2 hours') RETURNING id INTO unverified_item;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,status,created_at) VALUES(seller,chair,'furniture','good',2000,'removed',now()-interval '2 hours') RETURNING id INTO removed_item;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,status,created_at) VALUES(seller,chair,'furniture','good',2000,'reserved',now()-interval '2 hours') RETURNING id INTO reserved_item;
  -- Unrelated category proves that completing a chair purchase does not suppress other interests.
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(seller,shelf,'dorm','good',1000,now()-interval '2 hours') RETURNING id INTO unrelated_view;
  INSERT INTO listings(seller_id,title,category,condition,price_cents,created_at) VALUES(seller,shelf,'dorm','good',1000,now()-interval '2 hours') RETURNING id INTO unrelated_candidate;
  INSERT INTO recently_viewed_listings(user_id,listing_id,viewed_at) VALUES
    (buyer,old_view,now()-interval '2 days'),(buyer,unrelated_view,now()-interval '1 day');
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer)) THEN RAISE EXCEPTION 'Default opt-out ignored'; END IF;
  UPDATE users SET personalised_recommendations=true WHERE id IN (buyer,other_buyer);
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(other_buyer)) THEN RAISE EXCEPTION 'Another account history leaked'; END IF;
  INSERT INTO user_blocks(blocker_id,blocked_id) VALUES(blocked,buyer);
  IF NOT EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id=candidate) THEN RAISE EXCEPTION 'Relevant candidate missing'; END IF;
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id IN (old_view,own_item,blocked_item,unverified_item,removed_item,reserved_item,purchased)) THEN RAISE EXCEPTION 'Ineligible listing recommended'; END IF;
  DELETE FROM user_blocks WHERE blocker_id=blocked AND blocked_id=buyer;
  INSERT INTO user_blocks(blocker_id,blocked_id) VALUES(buyer,blocked);
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id=blocked_item) THEN RAISE EXCEPTION 'Forward block ignored'; END IF;
  INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,status,buyer_confirmed,seller_confirmed,item_snapshot,completed_at)
    VALUES(purchased,buyer,seller,2000,buyer,'completed',true,true,jsonb_build_object('category','furniture','title',chair),now()-interval '1 day');
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id IN (candidate,fresh_view)) THEN RAISE EXCEPTION 'Purchased product not suppressed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id=unrelated_candidate) THEN RAISE EXCEPTION 'Unrelated interest suppressed'; END IF;
  INSERT INTO recently_viewed_listings(user_id,listing_id,viewed_at) VALUES(buyer,fresh_view,now());
  IF NOT EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id=candidate) THEN RAISE EXCEPTION 'Renewed interest ignored'; END IF;
  UPDATE listings SET status='active' WHERE id=purchased;
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer) r WHERE r.id=purchased) THEN RAISE EXCEPTION 'Exact purchased listing recommended'; END IF;
  UPDATE users SET personalised_recommendations=false WHERE id=buyer;
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer)) THEN RAISE EXCEPTION 'Opt-out ignored'; END IF;
  IF NOT EXISTS(SELECT 1 FROM recently_viewed_listings WHERE user_id=buyer) THEN RAISE EXCEPTION 'Opt-out unexpectedly erased history'; END IF;
  UPDATE users SET personalised_recommendations=true WHERE id=buyer;
  DELETE FROM recently_viewed_listings WHERE user_id=buyer;
  IF EXISTS(SELECT 1 FROM uni_personal_recommendations(buyer)) THEN RAISE EXCEPTION 'Cleared history still used'; END IF;
  IF NOT uni_same_product('textbooks','Clean Code','9780132350884','textbooks','Different title','9780132350884') THEN RAISE EXCEPTION 'ISBN match rejected'; END IF;
  IF uni_same_product('textbooks','Clean Code','9780132350884','textbooks','Clean Code','9780132350891') THEN RAISE EXCEPTION 'Different ISBN matched'; END IF;
  RAISE NOTICE 'Personalisation privacy, ranking and purchase exclusions passed';
END $$;
ROLLBACK;
