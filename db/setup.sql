-- Fresh installation only. Run with psql -X -v ON_ERROR_STOP=1 -f db/setup.sql.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')) THEN
    RAISE EXCEPTION 'UniMarket setup requires an empty public schema. Use a new database.';
  END IF;
END $$;
\ir schema.sql
\ir messaging.sql
\ir message-replies.sql
\ir isbn.sql
\ir discovery.sql
\ir seller-tools.sql
\ir transactions.sql
\ir notifications.sql
\ir safety.sql
\ir academic.sql
\ir reputation.sql
\ir personalisation.sql
\ir meetups.sql
\ir support.sql
\ir integration.sql
