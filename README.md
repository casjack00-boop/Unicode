# UniMarket

UniMarket is a UT Tyler capstone prototype for student-to-student exchanges of textbooks, furniture and other college essentials, with a roommate finder. It is not an official university service or a payment processor.

## Features

- Marketplace search, filters, saved listings, recent views and personalised recommendations.
- Student profiles, biographies, buyer and seller reviews, private messaging and replies.
- Offers, reservations, campus meetups, recurring availability, exchange confirmation and transaction history.
- ISBN lookup and barcode scanning, academic preferences, textbook requests and roommate discovery.
- Notifications, blocking, reports, disputes, support tickets and authorised account moderation.
- Responsive interface, appearance and accessibility preferences, installable PWA and generic offline fallback.

## Quick start (Windows / PowerShell)

Requirements: Git, Node.js 22+ with npm, PostgreSQL 15+ with `psql` and `createdb` on PATH. The database installer requires permission to create `pg_trgm`.

```powershell
git clone --branch feature/unimarket-overhaul https://github.com/casjack00-boop/Unicode.git UniMarket
Set-Location UniMarket
npm ci
createdb -U postgres unimarket_local
psql -X -U postgres -d unimarket_local -v ON_ERROR_STOP=1 -f db/setup.sql
```

Use the approved merged branch instead once the pull request has been accepted. For an existing clone, use its repository root rather than cloning again. The setup script is **only for a new, empty database**; it installs 15 SQL scripts in order and does not create sample accounts. If a setup fails partway through, diagnose the error and use a new empty test database, not a populated database.

Create a private `.env` at the repository root (replace the example credentials with your own; URL-encode special characters in the password):

```dotenv
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/unimarket_local
PORT=3000
UNIMARKET_MAIL_MODE=console
```

The connection role needs the appropriate table, sequence and function permissions. Use a dedicated non-superuser role for a deployment. The `postgres` installer role in the example is only for local administration.

```powershell
npm start
```

Visit <http://localhost:3000>. Use `/api/health` to confirm database connectivity. For a local demo only, register with a controlled UT Tyler-format test address and retrieve the six-digit verification code from the server terminal. This does not prove ownership of a real university mailbox. Never expose console mode publicly.

### Configuration and existing installations

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP port (default 3000) |
| `UNIMARKET_MAIL_MODE` | `console` locally; `email` for actual delivery |
| `RESEND_API_KEY`, `UNIMARKET_MAIL_FROM` | Email provider credentials and authorised sender |
| `NODE_ENV` | Production requires configured email and Secure cookies (HTTPS) |
| `UNIMARKET_PUBLIC_ORIGIN` | Exact external origin without trailing slash, for write protection behind a proxy |
| `UNIMARKET_UPLOAD_DIR` | Optional absolute persistent photo directory; default is repository `uploads` |
| `OPEN_LIBRARY_CONTACT` | Optional catalogue request contact |
| `UNIMARKET_TEST_ORIGIN` | Optional smoke-test URL (default http://localhost:3000) |

For a database already migrated through Package L, stop the server, back up the database and uploads, then run only `psql -X -U postgres -d unimarket_dev -v ON_ERROR_STOP=1 -f db/integration.sql`. Earlier installations need the missing migrations in `db/setup.sql` order. Never run the fresh setup or optional seed on an existing populated database. Git worktrees do not share ignored `.env` or upload files; preserve the existing upload directory separately from the database backup.

### Moderator access (local test only)

Create and authenticate a controlled test student. An authorised database administrator connected to the intended test database can explicitly grant moderator access (replace the example address with the test account):

```sql
INSERT INTO moderation_admins(user_id)
SELECT id FROM users WHERE email = 'moderator-test@uttyler.edu' AND verified
ON CONFLICT DO NOTHING;
```

Sign in again, then open Settings → Moderation. Do not grant the role to arbitrary students. Never test suspension using your primary account.

## Verification

```powershell
npm test
createdb -U postgres unimarket_integration
psql -X -U postgres -d unimarket_integration -v ON_ERROR_STOP=1 -f db/setup.sql
psql -X -U postgres -d unimarket_integration -v ON_ERROR_STOP=1 -f test/database.integration.sql
npm audit
# With the server running in another terminal:
node scripts/smoke-api.js
```

Create and initialise the integration database only once. Reuse it for rollback-only SQL tests, or use a new empty database if a clean installation is needed. The SQL fixtures roll back; sequence counters may advance. The smoke script tests the running server, so check the configured database and port first. The Node tests include mocked routes and do not replace live browser or SQL testing.

## Further information

- [Validation summary](docs/validation-report.md): completed checks and remaining limitations.
- [QA bug-hunting checklist](docs/qa-testing.md): independent test-engineering handover.
- [Integration and security notes](docs/integration.md): detailed technical setup and migration instructions.
- Feature notes: [PWA](docs/pwa.md), [Community safety](docs/community-safety.md), [Reputation](docs/reputation.md), [Personalisation](docs/personalisation.md), [Meetups](docs/meetups.md), [Support](docs/support.md).

Live university email delivery, production deployment and formal penetration/accessibility audits are not claimed as completed. Do not commit credentials, database dumps, uploads or private interview transcripts.
