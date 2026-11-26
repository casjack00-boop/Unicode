-- Apply after meetups.sql. Additive: no account or listing records are removed.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS delivered_by_email boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS email_authenticated boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS support_tickets (
  id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 100),
  details text NOT NULL CHECK (char_length(details) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  reply text NOT NULL DEFAULT '' CHECK (char_length(reply)<=2000),
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
  resolved_by integer REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS support_user_history ON support_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_queue ON support_tickets(status,created_at);
CREATE TABLE IF NOT EXISTS account_moderation_actions (
  id serial PRIMARY KEY, admin_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('suspend','reinstate')),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_seller_created ON listings(seller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS verification_user_created ON verification_codes(user_id,created_at DESC);
-- Serialise new listing submissions per seller, including concurrent requests.
CREATE OR REPLACE FUNCTION uni_guard_listing_spam() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(71302, NEW.seller_id);
  IF EXISTS (SELECT 1 FROM users WHERE id=NEW.seller_id AND suspended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Account suspended' USING ERRCODE='UMS03';
  END IF;
  IF (SELECT count(*) FROM listings WHERE seller_id=NEW.seller_id AND created_at>now()-interval '1 hour')>=10 THEN
    RAISE EXCEPTION 'Listing rate limit' USING ERRCODE='UMS01';
  END IF;
  IF EXISTS (SELECT 1 FROM listings WHERE seller_id=NEW.seller_id AND status IN ('active','reserved')
    AND created_at>now()-interval '10 minutes' AND lower(btrim(title))=lower(btrim(NEW.title))
    AND category=NEW.category AND price_cents=NEW.price_cents
    AND coalesce(description,'')=coalesce(NEW.description,'')) THEN
    RAISE EXCEPTION 'Repeated listing' USING ERRCODE='UMS02';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_listing_spam ON listings;
CREATE TRIGGER uni_listing_spam BEFORE INSERT ON listings FOR EACH ROW EXECUTE FUNCTION uni_guard_listing_spam();
-- Keep blocking semantics and also stop new contact with suspended accounts.
CREATE OR REPLACE FUNCTION uni_contact_blocked(a integer,b integer) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a))
    OR EXISTS(SELECT 1 FROM users WHERE id IN(a,b) AND suspended_at IS NOT NULL);
$$;
-- Revoke current sessions and unused codes when suspension is recorded.
CREATE OR REPLACE FUNCTION uni_revoke_suspended_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.suspended_at IS NOT NULL AND OLD.suspended_at IS NULL THEN
    DELETE FROM sessions WHERE user_id=NEW.id;
    UPDATE verification_codes SET used=true WHERE user_id=NEW.id AND NOT used;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uni_suspend_revoke ON users;
CREATE TRIGGER uni_suspend_revoke AFTER UPDATE OF suspended_at ON users FOR EACH ROW EXECUTE FUNCTION uni_revoke_suspended_sessions();
COMMIT;
