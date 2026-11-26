-- Run after transactions.sql. Events and their notifications commit together.
BEGIN;
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  transactions BOOLEAN NOT NULL DEFAULT TRUE,
  price_drops BOOLEAN NOT NULL DEFAULT TRUE,
  saved_searches BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (char_length(term) BETWEEN 2 AND 120),
  isbn TEXT CHECK (isbn IS NULL OR isbn ~ '^97[89][0-9]{10}$'),
  category TEXT NOT NULL CHECK (category IN ('all','textbooks','furniture','dorm','electronics','clothing','other')),
  max_price_cents INTEGER CHECK (max_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches(user_id,id);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('messages','transactions','price_drops','saved_searches')),
  event_key TEXT NOT NULL,
  body TEXT NOT NULL,
  target_id INTEGER NOT NULL CHECK (target_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id,id DESC) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION uni_notify(p_user INTEGER,p_kind TEXT,p_key TEXT,p_body TEXT,p_target INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id=p_user AND verified) AND
     COALESCE((SELECT CASE p_kind WHEN 'messages' THEN messages WHEN 'transactions' THEN transactions
       WHEN 'price_drops' THEN price_drops WHEN 'saved_searches' THEN saved_searches ELSE FALSE END
       FROM notification_preferences WHERE user_id=p_user),TRUE) THEN
    INSERT INTO notifications(user_id,kind,event_key,body,target_id)
    VALUES(p_user,p_kind,p_key,p_body,p_target) ON CONFLICT(user_id,event_key) DO NOTHING;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION uni_message_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient INTEGER;
BEGIN
  SELECT CASE WHEN buyer_id=NEW.sender_id THEN seller_id ELSE buyer_id END INTO recipient
  FROM conversations WHERE id=NEW.conversation_id AND NEW.sender_id IN (buyer_id,seller_id);
  IF recipient IS NOT NULL THEN
    -- Do not copy private message text into the notification feed.
    PERFORM uni_notify(recipient,'messages','message:'||NEW.id,'You received a new message.',NEW.conversation_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS uni_message_alert ON messages;
CREATE TRIGGER uni_message_alert AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION uni_message_notification();

CREATE OR REPLACE FUNCTION uni_deal_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE label TEXT; recipient INTEGER; event TEXT;
BEGIN
  event := 'deal:'||NEW.id||':'||NEW.revision;
  IF TG_OP='INSERT' THEN
    PERFORM uni_notify(NEW.seller_id,'transactions',event,'You received an offer.',NEW.id);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    label := CASE NEW.status WHEN 'reserved' THEN 'An offer was accepted. The item is reserved.'
      WHEN 'declined' THEN 'An offer was closed or declined.' WHEN 'cancelled' THEN 'A reservation or offer was cancelled.'
      WHEN 'completed' THEN 'Both participants confirmed the exchange.' ELSE 'Transaction status updated.' END;
    -- Status transitions can include automatic closure of competing offers; both participants get a record.
    PERFORM uni_notify(NEW.buyer_id,'transactions',event,label,NEW.id);
    PERFORM uni_notify(NEW.seller_id,'transactions',event,label,NEW.id);
  ELSIF NEW.price_cents IS DISTINCT FROM OLD.price_cents OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN
    recipient := CASE WHEN NEW.proposed_by=NEW.buyer_id THEN NEW.seller_id ELSE NEW.buyer_id END;
    PERFORM uni_notify(recipient,'transactions',event,'You received a counteroffer.',NEW.id);
  ELSIF NEW.meetup_at IS DISTINCT FROM OLD.meetup_at OR NEW.meetup_spot IS DISTINCT FROM OLD.meetup_spot OR NEW.meetup_by IS DISTINCT FROM OLD.meetup_by OR NEW.meetup_confirmed IS DISTINCT FROM OLD.meetup_confirmed THEN
    recipient := CASE WHEN NEW.meetup_by=NEW.buyer_id THEN NEW.seller_id ELSE NEW.buyer_id END;
    IF NEW.meetup_confirmed THEN
      PERFORM uni_notify(NEW.meetup_by,'transactions',event,'Your meetup proposal was confirmed.',NEW.id);
    ELSE
      PERFORM uni_notify(recipient,'transactions',event,'A meetup was proposed or rescheduled.',NEW.id);
    END IF;
  ELSIF NEW.buyer_confirmed IS DISTINCT FROM OLD.buyer_confirmed THEN
    PERFORM uni_notify(NEW.seller_id,'transactions',event,'The buyer confirmed receipt.',NEW.id);
  ELSIF NEW.seller_confirmed IS DISTINCT FROM OLD.seller_confirmed THEN
    PERFORM uni_notify(NEW.buyer_id,'transactions',event,'The seller confirmed handover.',NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS uni_deal_alert ON marketplace_deals;
CREATE TRIGGER uni_deal_alert AFTER INSERT OR UPDATE ON marketplace_deals FOR EACH ROW EXECUTE FUNCTION uni_deal_notification();

CREATE OR REPLACE FUNCTION uni_listing_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient INTEGER;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.status='active' AND NEW.price_cents<OLD.price_cents THEN
      FOR recipient IN SELECT user_id FROM saved_listings WHERE listing_id=NEW.id AND user_id<>NEW.seller_id LOOP
        PERFORM uni_notify(recipient,'price_drops','price:'||NEW.id||':'||txid_current()||':'||NEW.price_cents,
          'A saved listing dropped from $'||to_char(OLD.price_cents/100.0,'FM999999990.00')||' to $'||to_char(NEW.price_cents/100.0,'FM999999990.00')||'.',NEW.id);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='active' THEN
    FOR recipient IN SELECT DISTINCT s.user_id FROM saved_searches s
      WHERE s.user_id<>NEW.seller_id AND (s.category='all' OR s.category=NEW.category)
      AND (s.max_price_cents IS NULL OR NEW.price_cents<=s.max_price_cents)
      AND ((s.isbn IS NOT NULL AND s.isbn=NEW.isbn) OR
        (s.isbn IS NULL AND strpos(lower(concat_ws(' ',NEW.title,NEW.description,NEW.category,NEW.author,NEW.department,NEW.course_number,NEW.edition)),lower(s.term))>0))
    LOOP
      PERFORM uni_notify(recipient,'saved_searches','match:'||NEW.id,'A new listing matches one of your saved searches.',NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS uni_listing_alert ON listings;
CREATE TRIGGER uni_listing_alert AFTER INSERT OR UPDATE OF price_cents ON listings FOR EACH ROW EXECUTE FUNCTION uni_listing_notification();
COMMIT;
