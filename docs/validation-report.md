# Validation summary — 26 November 2026

Scope: Packages A–M, including the interface refinements and review history. Package N is documentation only. This is a capstone validation record, not a production security certification.

| Check | Result | Evidence |
| --- | --- | --- |
| Node regression suite | 119 passed, 0 failed | Reconstructed source test run; developer reported the same local result |
| Fresh PostgreSQL setup | 25 application tables, zero sample accounts, exit 0 | Developer supplied complete `db/setup.sql` and table/count output from `unimarket_integration` |
| Personalisation SQL | Passed, rolled back, exit 0 | Developer supplied terminal output |
| Meetups SQL | Passed, rolled back, exit 0 | Developer supplied terminal output |
| Support SQL | Passed, rolled back, exit 0 | Developer supplied terminal output |
| Consolidated PostgreSQL integration | Passed by developer confirmation | Full consolidated output not supplied; rerun for independent QA evidence |
| Dependency audit | Developer indicated success | Actual advisory output not supplied; zero vulnerabilities not independently established |
| Live HTTP smoke test | Passed by developer confirmation | Output not supplied; script checks seven requests, not authenticated workflows |
| Firefox acceptance | 29/29 reported passing by developer | Developer confirmed all passed; no independent browser run claimed |
| Git publication | Developer confirmed Package M pushed | Final remote commit hash and PR state need verification before submission |

The automated suite contains unit and mocked-route checks. It does not prove absence of bugs, exhaustive security coverage or real-world email delivery. The PostgreSQL integration runner includes notifications, safety, academic discovery, personalisation, meetups, support and the roommate-date compatibility check. It does not cover every API path.

## Remaining limitations

- Real email delivery requires Resend credentials and an authorised sending domain; local console codes do not prove mailbox ownership.
- HTTPS, production proxy/origin configuration, least-privilege database permissions and additional network-level rate limiting require deployment-specific review.
- The account ID is hidden in the ordinary-student profile interface but numeric routing/API identifiers are not confidential.
- Reviews created without transaction links cannot reliably display a historical listing title. Recommendation similarity is heuristic. Moderation counters indicate unresolved cases, not unread cases.
- Photo records and files must be backed up separately; file-system and database writes cannot be one atomic transaction. Upload validation is not malware scanning.
- PWA fallback is generic and does not support offline transactions. No formal penetration test or accessibility certification was conducted.
- No payment processing, escrow, refund guarantee or official university affiliation is claimed.

See [integration notes](integration.md) for the source-level security review and [QA checklist](qa-testing.md) for independent testing. Record actual test output, browser version and commit hash with the handover. Do not mark pending independent checks as passed until executed.

## Submission gate

Before requesting PR review: check the working tree is clean, `git rev-list --left-right --count HEAD...origin/feature/unimarket-overhaul` is `0 0` after fetching, and the existing pull request targets the agreed branch. Review changed files for credentials, local data and uploads. Attach or summarise independent QA findings, document unresolved risks and request team review; do not merge without approval.
