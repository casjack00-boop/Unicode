\set ON_ERROR_STOP on
-- All existing SQL integration suites, including the compatibility check.
\ir notifications.integration.sql
\ir safety.integration.sql
\ir academic.integration.sql
\ir personalisation.integration.sql
\ir meetups.integration.sql
\ir support.integration.sql
BEGIN;
DO $$ DECLARE uid integer; post_id integer; BEGIN
  INSERT INTO users(email,display_name,verified) VALUES ('integration-'||txid_current()||'@uttyler.edu','Integration test',true) RETURNING id INTO uid;
  INSERT INTO roommate_posts(user_id,title,budget_cents,move_in,location) VALUES(uid,'Test roommate',50000,date '2027-01-01','either') RETURNING id INTO post_id;
  IF NOT EXISTS(SELECT 1 FROM roommate_posts WHERE id=post_id AND move_in=date '2027-01-01') THEN RAISE EXCEPTION 'Roommate date failed'; END IF;
  RAISE NOTICE 'Roommate date and consolidated database integration passed';
END $$;
ROLLBACK;
