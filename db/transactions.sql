-- Apply after seller-tools.sql. No payment or escrow processing.
BEGIN;
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'reserved', 'sold', 'removed'));
CREATE TABLE IF NOT EXISTS marketplace_deals (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reserved','declined','cancelled','completed')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  meetup_at TIMESTAMPTZ,
  meetup_spot TEXT,
  meetup_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  meetup_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  buyer_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  seller_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  item_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (buyer_id <> seller_id),
  CHECK (proposed_by IN (buyer_id, seller_id)),
  CHECK (meetup_by IS NULL OR meetup_by IN (buyer_id, seller_id)),
  CHECK ((meetup_at IS NULL AND meetup_spot IS NULL AND meetup_by IS NULL AND NOT meetup_confirmed)
      OR (meetup_at IS NOT NULL AND meetup_spot IS NOT NULL AND meetup_by IS NOT NULL)),
  CHECK (status <> 'completed' OR (buyer_confirmed AND seller_confirmed AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS deal_open_per_buyer ON marketplace_deals(listing_id,buyer_id)
  WHERE status IN ('pending','reserved');
CREATE UNIQUE INDEX IF NOT EXISTS deal_reservation_per_listing ON marketplace_deals(listing_id)
  WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS deals_buyer_history ON marketplace_deals(buyer_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS deals_seller_history ON marketplace_deals(seller_id,updated_at DESC);
COMMIT;
