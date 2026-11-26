-- Run after isbn.sql, discovery.sql, notifications.sql and safety.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS academic_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  major TEXT CHECK (char_length(major) <= 80),
  department TEXT CHECK (department ~ '^[A-Z][A-Z0-9 -]{0,15}$')
);
CREATE TABLE IF NOT EXISTS textbook_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  isbn TEXT CHECK (isbn ~ '^97[89][0-9]{10}$'),
  department TEXT CHECK (department ~ '^[A-Z][A-Z0-9 -]{0,15}$'),
  course TEXT CHECK (char_length(course) <= 16),
  notes TEXT CHECK (char_length(notes) <= 500),
  max_price_cents INTEGER CHECK (max_price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS textbook_requests_active_idx ON textbook_requests(created_at DESC,id DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS textbook_requests_owner_idx ON textbook_requests(user_id,status);
CREATE INDEX IF NOT EXISTS saved_listings_trending_idx ON saved_listings(saved_at,listing_id);
-- Exact ISBN when provided; otherwise a literal title substring. Budget always applies; department/course constraints apply to title matches.
CREATE OR REPLACE FUNCTION uni_textbook_match(r textbook_requests,l listings) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT l.status='active' AND l.category='textbooks' AND l.seller_id<>r.user_id
    AND (r.max_price_cents IS NULL OR l.price_cents<=r.max_price_cents)
    AND ((r.isbn IS NOT NULL AND r.isbn=l.isbn) OR
      (r.isbn IS NULL AND strpos(lower(l.title),lower(r.title))>0
        AND (r.department IS NULL OR upper(l.department)=r.department)
        AND (r.course IS NULL OR lower(l.course_number)=lower(r.course))))
$$;
-- Reuse saved-search notification preferences and deduplication, including for students
-- who already saved an identical search. Do not send alerts between blocked accounts.
CREATE OR REPLACE FUNCTION uni_textbook_request_alert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient INTEGER;
BEGIN
  FOR recipient IN SELECT DISTINCT r.user_id FROM textbook_requests r
    WHERE r.status='active' AND uni_textbook_match(r,NEW)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.blocker_id=r.user_id AND b.blocked_id=NEW.seller_id) OR
        (b.blocker_id=NEW.seller_id AND b.blocked_id=r.user_id))
  LOOP
    PERFORM uni_notify(recipient,'saved_searches','match:'||NEW.id,'A new listing matches a textbook request or saved search.',NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS uni_textbook_request_alert_trigger ON listings;
CREATE TRIGGER uni_textbook_request_alert_trigger AFTER INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION uni_textbook_request_alert();
COMMIT;
