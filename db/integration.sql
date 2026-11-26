-- Safe additive/compatibility upgrade for installations already through Package L.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='roommate_posts' AND column_name='movie_in') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
               AND table_name='roommate_posts' AND column_name='move_in') THEN
      -- Keep both columns and preserve existing canonical values.
      UPDATE public.roommate_posts SET move_in=movie_in WHERE move_in IS NULL AND movie_in IS NOT NULL;
    ELSE
      ALTER TABLE public.roommate_posts RENAME COLUMN movie_in TO move_in;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                 AND table_name='roommate_posts' AND column_name='move_in') THEN
    RAISE EXCEPTION 'Missing roommate move_in column';
  END IF;
END $$;
COMMIT;
