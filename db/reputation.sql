-- Apply after academic.sql. Existing seller reviews are retained.
BEGIN;
CREATE TABLE IF NOT EXISTS buyer_reviews (
  deal_id INTEGER PRIMARY KEY REFERENCES marketplace_deals(id) ON DELETE RESTRICT,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment)<=300),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transaction_disputes (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES marketplace_deals(id) ON DELETE RESTRICT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  details TEXT NOT NULL CHECK (char_length(details) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(deal_id,reporter_id)
);
CREATE TABLE IF NOT EXISTS moderation_admins (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('report','dispute')),
  target_id INTEGER NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL CHECK (new_status IN ('reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS disputes_queue ON transaction_disputes(status,created_at);
-- Explicit link for future seller reviews; legacy pair-based reviews remain valid.
ALTER TABLE seller_ratings ADD COLUMN IF NOT EXISTS deal_id INTEGER REFERENCES marketplace_deals(id) ON DELETE RESTRICT;
COMMIT;
