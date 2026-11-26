# Final integration and security review

## Installation and verification

Use Node.js with built-in `fetch` and `node:test` (Node 22+ recommended), PostgreSQL 15+ and `psql`. The column-list `ON DELETE SET NULL` in the message-reply constraint requires PostgreSQL 15 or later. Install dependencies with `npm ci`. Use a non-superuser database account with only the privileges needed for runtime; installing `pg_trgm` requires suitable database privileges. Configure a private `.env` with `DATABASE_URL` and optionally `PORT`. Do not commit `.env`, uploads or database backups.

For a **new, empty database only**, create it separately from `unimarket_dev` and run `psql -X -U postgres -d unimarket_integration -v ON_ERROR_STOP=1 -f db/setup.sql`. This psql entry point uses the existing ordered migrations. It refuses an existing public schema containing user tables or other relations, never seeds or drops records, and stops on the first error. Individual migrations commit independently; if a fresh setup fails, inspect the error and use another empty test database rather than rerunning over partial installation.

For an existing database already migrated through Package L, back it up, then run only `psql -X -U postgres -d unimarket_dev -v ON_ERROR_STOP=1 -f db/integration.sql`. The legacy `movie_in` column is renamed if needed; where both columns exist, only missing canonical values are filled and the legacy values are retained. No seed script is needed. `db/seed.sql` is optional sample data for an empty local demo database and should not be executed against a populated database or production.

Run `npm test` (or `node --test`) and then `psql -X -U postgres -d unimarket_integration -v ON_ERROR_STOP=1 -f test/database.integration.sql`. The SQL runner includes all six prior rollback-only suites and a roommate-date regression. Sequence counters can advance. Run the same suite against the migrated development database if desired, with the app stopped and backup available. `npm audit --omit=dev` requires registry connectivity; review all findings before altering dependency versions. Do not use `npm audit fix --force` indiscriminately.

Start the server with `npm start` or `node server/index.js`; then run `node scripts/smoke-api.js` in another terminal. Optional `UNIMARKET_TEST_ORIGIN` overrides the default `http://localhost:3000`. This script checks database health, public listings and roommate posts, anonymous access rejection, cross-origin write rejection and security headers. It does not authenticate, send mail or create records. For browser acceptance, exercise login, marketplace photos (including multiple uploads), roommate posting, messaging/replies, reservations, ratings/reviews, privacy controls, accessibility settings, support and moderator-only routes using separate student and moderator accounts. Confirm live email separately, if configured.

Photos are stored on disk outside Git. A worktree is not a copy of ignored upload files. If moving the running server between worktrees, preserve the original upload directory and point `UNIMARKET_UPLOAD_DIR` in the local `.env` to its absolute path (or copy the uploads without overwriting newer files). Database dumps contain photo URLs, not file bytes. Back up both database and uploads for disaster recovery. The new environment variable is optional; default storage remains the current worktree's `uploads` directory.

## Security review (source-level, not penetration testing)

| Area | Existing or added control | Residual issue / required verification |
| --- | --- | --- |
| Sessions | Random tokens, hashed database tokens, HttpOnly and SameSite=Lax cookies; Secure in production; suspension revocation | Confirm HTTPS deployment, session revocation and real-mail mode. Development console codes do not prove mailbox ownership. |
| Email | Per-account throttling, expiring one-use codes, capped attempts, no production console fallback | Live provider test, IP/network-level rate limits and keyed OTP hashing are future hardening; DB access could permit offline guesses of six-digit hashes. |
| Authorisation | Protected profile, message, transaction, support and moderation routes; ownership checks | Run multi-account browser/API checks. Public listings and photo reads remain intentionally public; numeric profile IDs are not secret. |
| Cross-origin writes | API middleware rejects mismatched Origin and cross-site Fetch Metadata on unsafe methods; no change to same-origin calls | Configure `UNIMARKET_PUBLIC_ORIGIN` to the exact external origin (e.g. `https://market.example`, no trailing slash) behind TLS termination. Requests without browser origin headers are still supported, so this is defence in depth, not a replacement for authentication. |
| Response headers | Disable Express identifying header; nosniff, frame denial, referrer policy; private no-store on API responses | Public immutable image responses retain their deliberate caching policy. CSP/HSTS and proxy configuration require a deployment-specific review. |
| SQL | Parameterised query values, allowlisted sort expressions, transactions and database constraints | Not a formal exhaustive injection or race audit. Verify with live PostgreSQL. |
| Photo uploads | Ownership before upload; random filenames, size/count limits, image signature checks; listing row lock and atomic batch insert with rollback | File-system and database commits are not a single atomic operation; crashes may leave orphan files. Signature checks do not constitute full image decoding or malware scanning. Verify uploads locally. |
| Moderation | Authorised role checks, audit entries, session revocation | Test actual ordinary/moderator role separation and audit history. |
| Dependencies | Lockfile retained, no new dependencies | Live npm advisory lookup not verified in isolated environment. Run `npm audit --omit=dev` locally. |
| Accessibility and wording | Existing keyboard controls, settings, native disclosures; English (UK) language metadata; retain US currency and official campus names | Manual Firefox keyboard, contrast, zoom and screen-reader verification remains required; no formal accessibility certification. |

## Test evidence and release gate

The JavaScript suite can run without a live database because route unit tests use mocks. It is not equivalent to browser, SQL or end-to-end verification. Fresh database installation, consolidated SQL suite, live HTTP checks, browser acceptance and dependency audit must be recorded locally. No production readiness or live university-email delivery claim should be made until applicable checks and deployment configuration are complete. Existing console mode is suitable for a local capstone demonstration only.
