-- Optional canonical ISBN-13 for textbook listings. Existing rows stay unchanged.
BEGIN;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS isbn TEXT
  CHECK (isbn IS NULL OR (category = 'textbooks' AND isbn ~ '^97[89][0-9]{10}$'));
CREATE INDEX IF NOT EXISTS listings_isbn_idx ON listings (isbn) WHERE isbn IS NOT NULL;
COMMIT;
