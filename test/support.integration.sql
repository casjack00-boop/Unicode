-- Run after support.sql. Temporary fixtures roll back; sequences may advance.
BEGIN;
DO $$
DECLARE student integer; moderator integer; ticket integer; item integer; tag text:=txid_current()::text; n integer;
BEGIN
  INSERT INTO users(email,display_name,verified) VALUES('l-student-'||tag||'@patriots.uttyler.edu','L student',true) RETURNING id INTO student;
  INSERT INTO users(email,display_name,verified) VALUES('l-mod-'||tag||'@patriots.uttyler.edu','L moderator',true) RETURNING id INTO moderator;
  INSERT INTO moderation_admins(user_id) VALUES(moderator);
  INSERT INTO support_tickets(user_id,subject,details) VALUES(student,'Test','Test ticket') RETURNING id INTO ticket;
  UPDATE support_tickets SET status='resolved',reply='Test response',resolved_at=now(),resolved_by=moderator WHERE id=ticket;
  IF NOT EXISTS(SELECT 1 FROM support_tickets WHERE id=ticket AND user_id=student AND status='resolved' AND reply='Test response') THEN RAISE EXCEPTION 'Ticket resolution failed'; END IF;
  INSERT INTO listings(seller_id,title,category,condition,price_cents) VALUES(student,'L item','other','good',1000) RETURNING id INTO item;
  BEGIN
    INSERT INTO listings(seller_id,title,category,condition,price_cents) VALUES(student,'L item','other','good',1000);
    RAISE EXCEPTION 'Duplicate listing accepted';
  EXCEPTION WHEN SQLSTATE 'UMS02' THEN NULL; END;
  FOR n IN 1..9 LOOP
    INSERT INTO listings(seller_id,title,category,condition,price_cents) VALUES(student,'L item '||n,'other','good',1000);
  END LOOP;
  BEGIN
    INSERT INTO listings(seller_id,title,category,condition,price_cents) VALUES(student,'L excess','other','good',1000);
    RAISE EXCEPTION 'Listing rate limit ignored';
  EXCEPTION WHEN SQLSTATE 'UMS01' THEN NULL; END;
  INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('l-token-'||tag,student,now()+interval '1 day');
  INSERT INTO verification_codes(user_id,code_hash,expires_at) VALUES(student,'l-code',now()+interval '10 minutes');
  UPDATE users SET suspended_at=now() WHERE id=student;
  IF EXISTS(SELECT 1 FROM sessions WHERE user_id=student) OR EXISTS(SELECT 1 FROM verification_codes WHERE user_id=student AND NOT used) THEN RAISE EXCEPTION 'Suspended credentials retained'; END IF;
  IF NOT uni_contact_blocked(student,moderator) THEN RAISE EXCEPTION 'Suspended contact allowed'; END IF;
  BEGIN
    INSERT INTO listings(seller_id,title,category,condition,price_cents) VALUES(student,'L suspended','other','good',1000);
    RAISE EXCEPTION 'Suspended seller accepted';
  EXCEPTION WHEN SQLSTATE 'UMS03' THEN NULL; END;
  UPDATE users SET suspended_at=NULL WHERE id=student;
  IF uni_contact_blocked(student,moderator) OR NOT EXISTS(SELECT 1 FROM listings WHERE id=item AND status='active') THEN RAISE EXCEPTION 'Reinstatement or listing preservation failed'; END IF;
  IF EXISTS(SELECT 1 FROM sessions WHERE user_id=student) THEN RAISE EXCEPTION 'Old session restored'; END IF;
  RAISE NOTICE 'Support tickets, listing spam, session revocation and reinstatement passed';
END $$;
ROLLBACK;
