# Package L — support and security

Apply `db/support.sql` after the existing migrations through `db/meetups.sql`. Existing rows remain intact. Run `node --test` and `psql -U postgres -d unimarket_dev -v ON_ERROR_STOP=1 -f test/support.integration.sql` (rollback-only). Re-run earlier academic and personalisation SQL tests; their historical listing fixtures were aged to exercise recommendations rather than the new spam guard.

## Support and moderation

Settings → Help and support: public FAQ, authenticated private tickets, up to five open tickets and five submissions per hour. Moderation → Support tickets and account moderation: existing moderators can respond and resolve tickets; inspect a student by ID and suspend/reinstate with a required reason. No new moderators are automatically created. Existing `moderation_admins` membership remains authoritative. Suspend only a test account for acceptance testing. Suspensions revoke sessions and pending verification codes, hide listings from discovery and block new contact; preserve existing deals, history and reviews. Reinstatement requires a fresh login, does not restore old sessions, and makes otherwise-active listings visible again. Moderators cannot suspend themselves or other moderators through this interface. Audit rows persist. Suspended users must contact the project administrator outside the application; configure a real project contact channel before deployment.

Listing protection: 10 new listings/hour and identical title (case-insensitive), category, price and description within 10 minutes of an active/reserved listing. Limits are database-side; legitimate repeated stock can be posted after the duplicate window. This is not a guarantee that listings are genuine. No automatic refunds or payment handling.

## Email

Existing local `.env` works without change in development, using console codes. No console code is sent by email or proves ownership of an email address. Never expose this mode to public traffic. Configure real delivery with a verified sending domain and restricted Resend key (https://resend.com/docs/api-reference/emails/send-email):

```dotenv
UNIMARKET_MAIL_MODE=email
RESEND_API_KEY=your_secret_key
UNIMARKET_MAIL_FROM=UniMarket <verification@your-verified-domain.example>
```

Restart and request a code to a UT Tyler mailbox you control. Codes expire in ten minutes, are single-use, with five attempts, at most one issue per minute and five per hour per address. Provider failures do not fall back to console. Existing accounts retain their records; email mode requires a fresh emailed-code session, including for existing accounts. The new `email_verified_at` records successful emailed-code confirmation, not university enrolment; legacy `verified` is not proof of real mail verification. `NODE_ENV=production` requires configured email and HTTPS for secure session cookies. Do not commit `.env` or log API keys. Live email delivery, public deployment hardening (global/IP abuse controls, proxy and TLS, secrets management) and full security audit remain pending. No claim of official university affiliation is made.

## Interview cross-reference (18 interviews)

Direct requirements: L1 FAQ, L2 support tickets, L3 listing spam, L4–5 suspension/reinstatement, L6 actual email verification. Indirect evidence is not represented as an explicit feature request. Source: Interview Transcriptions.md, interviewer groups in document order. Deborah, Blake and Precious sections are labelled sample feedback in the transcript; treat accordingly.

| Interview | Relevant evidence / scope |
|---|---|
| Kenny 1 Alex | No direct L request; keep basic marketplace workflow simple. |
| Kenny 2 Starlla | No direct L request; affordability remains core. |
| Kenny 3 Jayce | No direct L request; accessible, student-focused marketplace. |
| Cassidy 1 anonymous | Fake collectible and instant reporting concerns support L1/L2. |
| Cassidy 2 anonymous | Trustworthiness concerns support L6 and accountable moderation. |
| Cassidy 3 anonymous | Verified student community feels safer (L6). |
| Deborah (sample) | Easy listing functionality; avoid burdensome spam controls (L3 design constraint). |
| Blake (sample) | Suspicious seller/listing reporting and private communication (L1/L2/L4). |
| Precious (sample) | No direct L request; preserve existing listing/notification features. |
| Gia 1 Malachi | Verification/trust discussion; L6 indirect. |
| Gia 2 Lucas | Student verification and safer transactions discussion; L6/L1. |
| Gia 3 Artemis | Seller trust and university email verification; L6. |
| Cade 1 Adarina/Rina | Explicit customer service suggestion and scam concerns (L2/L4). |
| Cade 2 Stephen | Buyer protection and refund question; L1/L2 explain limits, no payment implementation. |
| Cade 3 Ethan | Explicit spam/fake listing and multiple account concerns (L3/L4/L6). |
| Taylor 1 Cierra | Scam/safety concerns, verified campus community (L1/L6). |
| Taylor 2 Jase | Prior scam and trust concerns (L1/L2). |
| Taylor 3 Emma | Scam concern and report-user suggestion (L1/L2/L4). |

The numerical limits, provider choice and moderator protection are engineering decisions, not interview mandates.
