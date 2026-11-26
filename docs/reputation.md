# Reputation and moderation

Apply `db/reputation.sql` after `db/academic.sql`. Seller ratings retain one editable review per buyer–seller pair (including legacy reviews); the newest submitted review links to a completed transaction. Buyer ratings are one editable review per completed deal. Seller ratings are still limited to completed buyers. The public profile shows separate buyer and seller reputation and counts of mutually confirmed purchases and sales.

## Moderator access

No account is an administrator by default. A trusted database operator can grant access in psql after verifying the account identity:

```sql
SELECT id, display_name, email FROM users WHERE verified = TRUE ORDER BY id;
-- Replace 123 with the verified, authorised moderator's ID.
INSERT INTO moderation_admins (user_id) VALUES (123) ON CONFLICT DO NOTHING;
-- Revoke when no longer needed:
DELETE FROM moderation_admins WHERE user_id = 123;
```

Log into that account, then Settings → Moderation. Ordinary students cannot read or update the moderation queue through the API. The dashboard shows up to 100 cases per type and selected status. Reviewed/dismissed actions create an audit record, not a ban, refund, or automated enforcement. Use the existing database operator procedures for further action. Do not deploy publicly while development-only verification codes or other insecure authentication practices remain enabled. Reports and disputes may contain personal data; grant access only to authorised operators and establish retention and review policies before public deployment.

## Disputes

A transaction participant can submit one dispute for a reserved, completed or cancelled deal. Disputes do not alter transaction state, refund funds or resolve payment issues. The reporter can see their case status. No payment processing is performed. Review authors can revise their reviews. Buyer review comments and names are visible to signed-in students.
