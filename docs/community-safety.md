# Community safety — development operations

Apply `db/safety.sql` after `db/notifications.sql`, then restart the server. Run `node --test` and `psql -v ON_ERROR_STOP=1 -f test/safety.integration.sql` against a development database (with the appropriate connection arguments). The SQL test rolls back records; sequences may advance.

Students can report other accounts, listings and messages received in conversations they participate in. Reports capture evidence at the time of reporting. There is no student-facing report queue. Only authorised project operators with database access should inspect or change reports. Treat report text and message evidence as confidential; do not include it in screenshots, public logs or demos. Establish a retention policy before real deployment.

For a local demonstration, an authorised operator can inspect the queue in psql:

```sql
SELECT id, target_type, reason, status, created_at FROM safety_reports WHERE status='open' ORDER BY created_at;
-- Review one report privately, with a real report ID substituted:
SELECT reporter_id, reported_user_id, details, evidence FROM safety_reports WHERE id=123;
-- After reviewing, update the status (does not suspend any account):
UPDATE safety_reports SET status='reviewed' WHERE id=123 AND status='open';
```

Blocking prevents new marketplace conversations, messages, new offers and pending-offer acceptance/counteroffers between the two accounts. Existing conversation history and reservations remain available for resolution. Blocks do not hide listings, prevent public profile viewing, suppress previously generated alerts or delete reviews. No automatic suspension, refund, escrow or fraud-detection claim is made. Purchase-only seller ratings remain unchanged. Limits: 20 messages/minute, 10 new offers/minute and five reports/hour per account. This is not comprehensive abuse prevention or a production moderation system.
