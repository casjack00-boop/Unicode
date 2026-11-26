-- Apply after reputation.sql. Additive; existing users opt in explicitly.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS biography TEXT NOT NULL DEFAULT ''
  CHECK (char_length(biography) <= 500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS personalised_recommendations BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS deals_completed_buyer_idx ON marketplace_deals(buyer_id, completed_at DESC)
  WHERE status = 'completed';

-- Strong product match, not merely a shared broad category. Different known ISBNs
-- are distinct books. pg_trgm is already installed by discovery.sql.
CREATE OR REPLACE FUNCTION uni_same_product(cat_a TEXT, title_a TEXT, isbn_a TEXT,
  cat_b TEXT, title_b TEXT, isbn_b TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(cat_a = cat_b AND CASE
    WHEN cat_a = 'textbooks' AND nullif(isbn_a,'') IS NOT NULL AND nullif(isbn_b,'') IS NOT NULL
      THEN isbn_a = isbn_b
    ELSE similarity(lower(title_a), lower(title_b)) >= 0.45
      OR greatest(word_similarity(lower(title_a),lower(title_b)),
                  word_similarity(lower(title_b),lower(title_a))) >= 0.75
  END, FALSE);
$$;

CREATE OR REPLACE FUNCTION uni_personal_recommendations(viewer INTEGER)
RETURNS TABLE(id INTEGER, title TEXT, price_cents INTEGER, category TEXT, condition TEXT, status TEXT, photo_url TEXT)
LANGUAGE sql STABLE AS $$
  WITH history AS (
    SELECT v.listing_id, v.viewed_at, h.category, h.title, h.isbn
    FROM recently_viewed_listings v JOIN listings h ON h.id=v.listing_id
    JOIN users seller ON seller.id=h.seller_id AND seller.verified
    WHERE v.user_id=viewer AND h.seller_id<>viewer AND h.status<>'removed'
      AND v.viewed_at >= now()-interval '30 days'
      AND NOT uni_contact_blocked(viewer,h.seller_id)
    ORDER BY v.viewed_at DESC, v.listing_id DESC LIMIT 20
  ), purchases AS (
    SELECT d.listing_id, d.completed_at, d.item_snapshot->>'category' AS category,
      d.item_snapshot->>'title' AS title, d.item_snapshot->>'isbn' AS isbn
    FROM marketplace_deals d WHERE d.buyer_id=viewer AND d.status='completed'
  )
  SELECT l.id,l.title,l.price_cents,l.category,l.condition,l.status,
    (SELECT p.url FROM listing_photos p WHERE p.listing_id=l.id ORDER BY p.position LIMIT 1)
  FROM listings l JOIN users seller ON seller.id=l.seller_id AND seller.verified
  CROSS JOIN LATERAL (
    SELECT max(CASE WHEN uni_same_product(l.category,l.title,l.isbn,h.category,h.title,h.isbn)
                    THEN 2 ELSE 1 END) AS score, max(h.viewed_at) AS latest
    FROM history h WHERE h.category=l.category AND h.listing_id<>l.id
  ) interest
  WHERE EXISTS (SELECT 1 FROM users u WHERE u.id=viewer AND u.verified AND u.personalised_recommendations)
    AND l.status='active' AND l.seller_id<>viewer AND interest.score IS NOT NULL
    AND NOT uni_contact_blocked(viewer,l.seller_id)
    AND NOT EXISTS (SELECT 1 FROM history h WHERE h.listing_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.listing_id=l.id OR
      (uni_same_product(l.category,l.title,l.isbn,p.category,p.title,p.isbn)
       AND NOT EXISTS (SELECT 1 FROM history h WHERE h.viewed_at>p.completed_at
         AND uni_same_product(l.category,l.title,l.isbn,h.category,h.title,h.isbn))))
  ORDER BY interest.score DESC,interest.latest DESC,l.created_at DESC,l.id DESC LIMIT 6;
$$;
COMMIT;
