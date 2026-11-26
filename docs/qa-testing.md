# Independent QA — UniMarket bug-hunting checklist

Goal: find defects, not merely confirm happy paths. Use only an authorised local test instance with synthetic accounts and listings. Never attack live university systems, real students or production data. Do not use actual personal details or send unsolicited verification mail.

## Preparation

- Create a dedicated empty database (e.g. `unimarket_qa`) using the README setup. Point a separate checkout's private `.env` at it, with `PORT=3001`, `UNIMARKET_MAIL_MODE=console` and a separate upload directory. Confirm `/api/health` on port 3001 before creating fixtures. Do not modify `unimarket_dev` or use its photo directory.
- Create four controlled accounts: seller A, buyer B, unrelated student C and moderator M (grant via README). Use separate Firefox profiles/containers so sessions do not overwrite each other; duplicate tabs in each session for concurrency tests. Give A several listings with similar titles, ISBNs, differing categories and prices. Create completed and pending deals and both types of review as needed. Keep a record of test IDs.
- Record the commit hash (`git rev-parse HEAD`), browser/OS, viewport, Node/PostgreSQL versions and time zone. Run `npm test`, `npm audit`, the SQL integration runner against the test DB, and the HTTP smoke test with `$env:UNIMARKET_TEST_ORIGIN='http://localhost:3001'` while the QA server runs. Save summaries, not credentials or console codes.
- Use Firefox DevTools Network/Console to inspect failed requests, status codes and duplicate requests. For authorisation checks, replay only the QA instance's own requests as C or an anonymous session, changing a test record identifier. The UI hiding a button is not a security test. Never include session cookies or verification codes in bug reports.

## P0 — Release blockers (run first)

| ID | Try to break | Expected result / bug signal |
| --- | --- | --- |
| QA-01 | Login with wrong domain, malformed email, wrong/expired/reused code; request codes repeatedly | Invalid requests denied; 60s cooldown, five requests/hour, five failed attempts and one-use codes enforced; no unintended session |
| QA-02 | Sign out in one tab and refresh protected pages in another; try back/forward and offline mode | Session invalidated; no private data recoverable from cache |
| QA-03 | As C or logged out, request A/B messages, deals, tickets, preferences and moderation APIs using fixture IDs | Unauthorised reads/writes rejected (401/403/404 as appropriate); no private payload or changed records |
| QA-04 | As C, attempt to edit/delete A's listing, upload to it, or change A's profile via replayed QA requests | Ownership enforced server-side; A's records unchanged |
| QA-05 | As ordinary student open moderation pages directly and attempt a moderator action | No moderation data or action; backend denies access even if static page shell loads |
| QA-06 | As M suspend B while B has two active sessions; attempt actions and login; reinstate B | Sessions revoked, prohibited actions denied, listings hidden during suspension, records retained; fresh login works after reinstatement |
| QA-07 | As M try to suspend self or another controlled moderator; omit the reason | Rejected; valid actions have actor, target, reason and time in audit history |
| QA-08 | Two buyers make offers on one listing; seller accepts from two stale tabs nearly simultaneously | At most one reserved deal; listing/deal status stays consistent; loser receives a conflict or rejection |
| QA-09 | Cancel, confirm handover or complete the same deal repeatedly from different tabs; submit stale revisions | No duplicate completion, incorrect relisting or inconsistent sale state; valid transition only |
| QA-10 | Run reservation-expiry integration suite; test cancelled/expired vs confirmed handover in QA fixtures | Unconfirmed expired reservation released; confirmed handover protected; completed deal stays sold |
| QA-11 | Block another test account during active messaging/deal; retry new contact from both sides | New prohibited contact blocked; existing history handled as intended; no bypass through a different screen |
| QA-12 | Enter harmless markup such as `<b>QA marker</b>` in biography, listing, message, support ticket and reviews | User text rendered literally, not as HTML; no unexpected DOM or script execution |
| QA-13 | Upload 0, 1, 3 and 4 files; oversized (>5 MiB) and a text file renamed `.jpg`; parallel uploads | Invalid uploads rejected; max 3 accepted; no broken photo references or overwritten unrelated photos |
| QA-14 | Submit identical listing twice rapidly and 11 distinct listings in an hour using a fresh QA seller | Duplicate/window and hourly limits enforced; no duplicate rows beyond intended restrictions |
| QA-15 | Use different accounts to open personalised suggestions, private history and support ticket histories | Each account sees only its own private data; disabling recommendations persists and suppresses personalised results |

## P1 — High-value functional and edge-case checks

| ID | Try to break | Expected result / bug signal |
| --- | --- | --- |
| QA-16 | Search with empty/long queries, quotes, apostrophes, accented text; combine filters, sort and reset | No 500 or stale results; filters and sort applied correctly; useful empty state |
| QA-17 | Enter zero, negative, decimal, excessive and nonnumeric prices; leave required fields blank | Invalid values rejected clearly; valid values preserved in USD |
| QA-18 | Edit listing then inspect saved list and existing transaction; mark sold/reserved; inspect discovery | Status and current data consistent; historical snapshot preserved; no stale purchasable sold item |
| QA-19 | Rapidly save/unsave and open same listing repeatedly; clear viewing history | No duplicates; counters and history update; clearing persists |
| QA-20 | Enable personalisation; view similar items, purchase one, view a similar product again | Purchased matches suppressed until renewed interest; unrelated results remain; own/blocked listings excluded |
| QA-21 | Empty, 500-character and 501-character biography; newline, emoji and long unbroken word | Length validated; layout wraps; biography centred; empty clears correctly |
| QA-22 | View own profile, another profile as C, and another as M, including direct URL | ID visible only to owner/moderator in UI; shield only where authorised; correct target; existing numeric URL IDs are known limitation |
| QA-23 | Click seller/buyer review counts; compare 0 reviews, multiple reviews, >20 if practical; edit listing title | Correct role and order, date and historical title; legacy unlinked listing marked unavailable; pagination has no duplicates |
| QA-24 | Review before completion, as unrelated account, with invalid stars, repeat same review | Eligibility enforced; one intended review per applicable transaction/relationship; no inflated count |
| QA-25 | Send rapid messages, multiline/long text, reply to earlier message; switch threads during fetch | Correct recipient/thread; no duplicate sends or stale thread display; timestamps and reply context correct |
| QA-26 | Right-click/long-press message; select partial text, dismiss menu with keyboard/click elsewhere | Context actions work; native selection remains possible; no stuck overlay |
| QA-27 | Create simultaneous offer/counteroffer from two tabs, decline and cancel | Valid state transitions only; stale update cannot overwrite newer state |
| QA-28 | Save weekly availability with end before start, equal times, all days unchecked; reload | Invalid same-day ranges rejected; valid schedule persists or clears |
| QA-29 | Propose past/invalid meetup, custom location, suggested library/University Center, reschedule | Valid proposal/confirmation and deadline; no nonsensical accepted date; Central Time handling consistent |
| QA-30 | Toggle notification preferences; generate test message, offer, saved-search event; mark read and reload | Notifications match applicable settings; unread counts update; no other-account events |
| QA-31 | Try valid ISBN, bad check digit, unknown ISBN, external lookup outage, denied camera | Clear fallback/error; manual entry still usable; no stuck scanner or lost listing draft |
| QA-32 | Create textbook request, fulfil with matching test listing; try unrelated ISBN/department | Correct matching and notifications; nonmatches not falsely linked |
| QA-33 | Create roommate post, check move-in date round trip, edit and inspect another user's post | Correct `move_in` date, required fields and ownership; no fresh-schema error |
| QA-34 | Submit support ticket blank/too long; create five open tickets then attempt sixth; resolve one, wait out the hourly limit and retry | Validation and open-ticket limit enforced; response and state persist; capacity freed after resolution subject to five submissions per hour |
| QA-35 | Create reports/disputes/tickets from fixture accounts; view latest case, resolve one, refresh dashboard | Counts reflect unresolved cases across queues; latest case and dedicated page accurate; account count reflects suspensions |
| QA-36 | Use moderation shield from two different profiles successively; cancel action, then confirm on intended account | No stale account target; cancel makes no change; action and audit target correct |
| QA-37 | Remove/reinstate moderator test membership using authorised QA admin, then refresh/login | Protected endpoints reflect current membership; no unauthorised moderation |

## P2 — Interface, accessibility and resilience

| ID | Try to break | Expected result / bug signal |
| --- | --- | --- |
| QA-38 | Test at 320, 375, 768 and 1280px; 200% zoom; long names and titles | No clipped controls, horizontal overflow, overlapping headers or inaccessible dialogs |
| QA-39 | Tab/Shift+Tab through Settings, dialogs and forms; Enter/Space and Escape | Visible focus, labelled controls, correct focus return, no keyboard trap |
| QA-40 | Toggle light/dark/high contrast/large text/reduced motion; refresh and sign out/in | Readable controls and states, intended preference persistence; no broken alignment |
| QA-41 | Collapse/expand all six Settings panels; navigate away and back; open Help | Collapsed by default on fresh load, controls still save, heading centred, help and back links work |
| QA-42 | Use slow network or offline mode mid-submit; reconnect, retry, refresh | Clear error or recoverable state; no duplicate records or silent loss; private data not cached |
| QA-43 | Stop QA server briefly; restart, refresh session and listing photos | Recovery without database corruption; files remain visible; no credentials in browser error |
| QA-44 | Test PWA offline fallback and install affordance where supported | Generic offline page only, no cached private API data; Firefox desktop install may be unsupported |
| QA-45 | Inspect all visible labels, currency and dates; use different OS/browser locale | Consistent British spelling, US dollar amounts, campus terminology and intended Central Time presentation |

## Bug reporting and triage

File a GitHub issue or agreed team tracker entry for each distinct defect. Include:

```text
Title: [P0/P1/P2] Area – observable failure
Build/commit:
Environment: browser/version, OS, viewport, database (QA only)
Account roles and synthetic record IDs:
Preconditions:
Steps to reproduce (numbered):
Expected result:
Actual result:
Reproducibility: e.g. 3/3 attempts
Evidence: redacted screenshot, status code, console error or log excerpt
Impact / workaround:
Retest result after fix:
```

P0 = security/privacy breach, data loss, inconsistent sale state or blocked core workflow; block submission until fixed or explicitly accepted by team. P1 = significant functional defect; prioritise before submission. P2 = cosmetic, accessibility or resilience issue; triage based on impact (inaccessible core actions can be P0/P1). Mark every case Pass, Fail, Blocked or Not run. A blocked or unexecuted case is not a pass. Reproduce a failure in a clean session, preserve evidence, and retest the fix plus adjacent workflows. Use the QA database only and clean up synthetic records/roles when no longer needed. Do not perform destructive testing against the original development database.
