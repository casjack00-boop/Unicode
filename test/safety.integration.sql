-- Development-only rollback test. Sequence numbers may advance.
BEGIN;
DO $$
DECLARE buyer INTEGER; seller INTEGER; outsider INTEGER; item INTEGER; conv INTEGER; deal INTEGER; token TEXT:=txid_current()::text; i INTEGER;
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES ('safety-buyer-'||token||'@patriots.uttyler.edu','Safety buyer',TRUE) RETURNING id INTO buyer;
  INSERT INTO users(email,display_name,verified) VALUES ('safety-seller-'||token||'@patriots.uttyler.edu','Safety seller',TRUE) RETURNING id INTO seller;
  INSERT INTO users(email,display_name,verified) VALUES ('safety-other-'||token||'@patriots.uttyler.edu','Safety outsider',TRUE) RETURNING id INTO outsider;
  INSERT INTO listings(seller_id,title,price_cents,category,condition) VALUES(seller,'Safety test',3000,'textbooks','good') RETURNING id INTO item;
  INSERT INTO conversations(listing_id,buyer_id,seller_id) VALUES(item,buyer,seller) RETURNING id INTO conv;
  INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,item_snapshot) VALUES(item,buyer,seller,3000,buyer,'{}') RETURNING id INTO deal;
  INSERT INTO user_blocks(blocker_id,blocked_id) VALUES(seller,buyer);
  IF NOT uni_contact_blocked(buyer,seller) OR NOT uni_contact_blocked(seller,buyer) THEN RAISE EXCEPTION 'Bidirectional block missing'; END IF;
  BEGIN INSERT INTO messages(conversation_id,sender_id,body) VALUES(conv,buyer,'blocked'); RAISE EXCEPTION 'Block bypassed'; EXCEPTION WHEN SQLSTATE 'UMB01' THEN NULL; END;
  BEGIN INSERT INTO messages(conversation_id,sender_id,body) VALUES(conv,seller,'blocked'); RAISE EXCEPTION 'Reverse block bypassed'; EXCEPTION WHEN SQLSTATE 'UMB01' THEN NULL; END;
  BEGIN UPDATE marketplace_deals SET status='reserved',revision=revision+1 WHERE id=deal; RAISE EXCEPTION 'Blocked acceptance permitted'; EXCEPTION WHEN SQLSTATE 'UMB01' THEN NULL; END;
  UPDATE marketplace_deals SET status='cancelled',revision=revision+1 WHERE id=deal;
  BEGIN INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,item_snapshot) VALUES(item,buyer,seller,3000,buyer,'{}'); RAISE EXCEPTION 'Blocked offer permitted'; EXCEPTION WHEN SQLSTATE 'UMB01' THEN NULL; END;
  DELETE FROM user_blocks WHERE blocker_id=seller AND blocked_id=buyer;
  IF uni_contact_blocked(buyer,seller) THEN RAISE EXCEPTION 'Unblock failed'; END IF;
  BEGIN INSERT INTO messages(conversation_id,sender_id,body) VALUES(conv,outsider,'invalid sender'); RAISE EXCEPTION 'Outsider permitted'; EXCEPTION WHEN SQLSTATE 'UMB03' THEN NULL; END;
  FOR i IN 1..20 LOOP INSERT INTO messages(conversation_id,sender_id,body) VALUES(conv,buyer,'test'); END LOOP;
  BEGIN INSERT INTO messages(conversation_id,sender_id,body) VALUES(conv,buyer,'too many'); RAISE EXCEPTION 'Message limit bypassed'; EXCEPTION WHEN SQLSTATE 'UMB02' THEN NULL; END;
  FOR i IN 1..5 LOOP INSERT INTO safety_reports(reporter_id,reported_user_id,target_type,reason) VALUES(buyer,seller,'user','spam'); END LOOP;
  BEGIN INSERT INTO safety_reports(reporter_id,reported_user_id,target_type,reason) VALUES(buyer,seller,'user','spam'); RAISE EXCEPTION 'Report limit bypassed'; EXCEPTION WHEN SQLSTATE 'UMB02' THEN NULL; END;
  RAISE NOTICE 'PASS: block, reverse block, offer guards, cancellation, unblock, message membership and rate limits';
END; $$;
ROLLBACK;
