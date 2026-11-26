-- Additive migration; run after isbn.sql. pg_trgm enables typo-tolerant search.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS saved_listings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS recently_viewed_listings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS saved_listings_user_time_idx ON saved_listings(user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS recently_viewed_user_time_idx ON recently_viewed_listings(user_id, viewed_at DESC);
COMMIT;
