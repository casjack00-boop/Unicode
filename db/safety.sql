-- Run after notifications.sql. Additive community-safety migration.
BEGIN;
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_reverse ON user_blocks(blocked_id, blocker_id);
CREATE TABLE IF NOT EXISTS safety_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reported_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','listing','message')),
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('scam','harassment','misleading','spam','unsafe','other')),
  details TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  evidence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX IF NOT EXISTS safety_reports_queue ON safety_reports(status,created_at);
CREATE INDEX IF NOT EXISTS safety_reports_rate ON safety_reports(reporter_id,created_at);
CREATE INDEX IF NOT EXISTS safety_messages_rate ON messages(sender_id,created_at);
-- Pair locks serialize a block and new contact between the same two students.
CREATE OR REPLACE FUNCTION uni_contact_lock(a INTEGER,b INTEGER) RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(LEAST(a,b),GREATEST(a,b));
$$;
CREATE OR REPLACE FUNCTION uni_contact_blocked(a INTEGER,b INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a));
$$;
CREATE OR REPLACE FUNCTION uni_block_lock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM uni_contact_lock(OLD.blocker_id,OLD.blocked_id); RETURN OLD; END IF;
  PERFORM uni_contact_lock(NEW.blocker_id,NEW.blocked_id); RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_block_guard ON user_blocks;
CREATE TRIGGER uni_block_guard BEFORE INSERT OR DELETE ON user_blocks FOR EACH ROW EXECUTE FUNCTION uni_block_lock();
CREATE OR REPLACE FUNCTION uni_guard_contact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a INTEGER; b INTEGER; n INTEGER;
BEGIN
  IF TG_TABLE_NAME='messages' THEN
    SELECT buyer_id,seller_id INTO a,b FROM conversations WHERE id=NEW.conversation_id;
    IF a IS NULL OR NEW.sender_id NOT IN (a,b) THEN RAISE EXCEPTION 'Invalid message participant' USING ERRCODE='UMB03'; END IF;
  ELSE
    a := NEW.buyer_id; b := NEW.seller_id;
    -- Preserve existing reservations and allow pending offers to be closed safely.
    IF TG_OP='UPDATE' THEN
      IF OLD.status <> 'pending' OR NEW.status IN ('cancelled','declined') THEN RETURN NEW; END IF;
    END IF;
  END IF;
  PERFORM uni_contact_lock(a,b);
  IF uni_contact_blocked(a,b) THEN RAISE EXCEPTION 'Contact unavailable' USING ERRCODE='UMB01'; END IF;
  IF TG_TABLE_NAME='messages' THEN
    PERFORM pg_advisory_xact_lock(-801,NEW.sender_id);
    SELECT count(*) INTO n FROM messages WHERE sender_id=NEW.sender_id AND created_at > clock_timestamp()-interval '1 minute';
    IF n >= 20 THEN RAISE EXCEPTION 'Message rate limit' USING ERRCODE='UMB02'; END IF;
  ELSIF TG_TABLE_NAME='marketplace_deals' AND TG_OP='INSERT' THEN
    PERFORM pg_advisory_xact_lock(-802,NEW.buyer_id);
    SELECT count(*) INTO n FROM marketplace_deals WHERE buyer_id=NEW.buyer_id AND created_at > clock_timestamp()-interval '1 minute';
    IF n >= 10 THEN RAISE EXCEPTION 'Offer rate limit' USING ERRCODE='UMB02'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_conversation_guard ON conversations;
CREATE TRIGGER uni_conversation_guard BEFORE INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION uni_guard_contact();
DROP TRIGGER IF EXISTS uni_message_guard ON messages;
CREATE TRIGGER uni_message_guard BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION uni_guard_contact();
DROP TRIGGER IF EXISTS uni_offer_guard ON marketplace_deals;
CREATE TRIGGER uni_offer_guard BEFORE INSERT OR UPDATE ON marketplace_deals FOR EACH ROW EXECUTE FUNCTION uni_guard_contact();
CREATE OR REPLACE FUNCTION uni_report_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(-803,NEW.reporter_id);
  SELECT count(*) INTO n FROM safety_reports WHERE reporter_id=NEW.reporter_id AND created_at > clock_timestamp()-interval '1 hour';
  IF n >= 5 THEN RAISE EXCEPTION 'Report rate limit' USING ERRCODE='UMB02'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_report_guard ON safety_reports;
CREATE TRIGGER uni_report_guard BEFORE INSERT ON safety_reports FOR EACH ROW EXECUTE FUNCTION uni_report_limit();
COMMIT;
