-- Run after isbn.sql and discovery.sql. Existing listings keep NULL dimensions.
BEGIN;
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS width_measure NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS height_measure NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS depth_measure NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS dimension_unit TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'listings'::regclass AND conname = 'listings_dimensions_valid') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_dimensions_valid CHECK (
      (width_measure IS NULL AND height_measure IS NULL AND depth_measure IS NULL AND dimension_unit IS NULL)
      OR (category = 'furniture' AND width_measure IS NOT NULL AND height_measure IS NOT NULL
          AND depth_measure IS NOT NULL AND dimension_unit IS NOT NULL
          AND width_measure BETWEEN 0.01 AND 10000 AND height_measure BETWEEN 0.01 AND 10000
          AND depth_measure BETWEEN 0.01 AND 10000 AND dimension_unit IN ('in', 'cm'))
    );
  END IF;
END; $$;
COMMIT;
