# Package K — Campus meetup improvements

## Behaviour and installation

Run `psql -U postgres -d unimarket_dev -v ON_ERROR_STOP=1 -f db/meetups.sql` after backing up the database and stopping the server. This additive migration follows Package J. Existing reserved transactions receive at least 48 hours from migration time; a confirmed future meetup can retain a longer deadline. Existing completed, cancelled and pending transactions are unchanged.

On Offers & transactions, expand Edit weekly availability. Select days and same-day time ranges, then save. Clear all days to remove availability. Only authenticated participants in open transactions can see a seller's weekly availability, and blocked contacts cannot see it. This is a scheduling hint in America/Chicago (Central Time), not a booking system. The existing meetup date input continues to use the browser's local time; dates displayed on transaction cards use Central Time. A seller can specify one window per weekday, with no overnight window. Suggested locations are University Center and Muntz Library public entrances; custom public locations remain available. These are suggestions, not university-approved exchange zones. Verify opening hours and campus rules before meeting.

An accepted offer receives a 48-hour deadline. An unconfirmed meetup proposal never extends it. Mutual meetup confirmation changes the deadline to 24 hours after the meeting; rescheduling a previously confirmed meetup removes its confirmation and caps the remaining hold at 48 hours. The background process runs at startup and once per minute in batches of 100, using the same listing-before-deal lock order as transaction mutations. Expired deals retain history as cancelled with `expired_at` recorded; an associated reserved listing returns to active. The existing cancellation notification goes to both participants, subject to their preferences. A handover confirmation from either party pauses automatic expiration; explicit cancellation and dispute procedures remain available. During server downtime expiry is processed after restart. No financial operations occur. Previously declined competing offers are not reopened.

## Interview traceability

Cross-reference: `Interview Transcriptions.md` (18 interviews, six groups). The following identifies direct or contextual support without attributing the exact timeout policy to interviewees.

| Interview | Package K relevance |
|---|---|
| Kenny 1 (Alex) | No direct meetup requirement; retain existing marketplace simplicity. |
| Kenny 2 (Starlla) | Student-to-student proximity supports campus-based exchange. |
| Kenny 3 (Jayce) | Simple student marketplace; no direct scheduling requirement. |
| Anonymous 1 | Difficult schedule coordination and desire for mutually safe, monitored public places. |
| Anonymous 2 | Multiple interested buyers and reserved visibility; social campus locations and library. |
| Anonymous 3 | Schedule delays, ghosting and public well-lit student union/library. |
| Alaiya 1 (Deborah) | General marketplace feedback; no direct weekly availability requirement. |
| Alaiya 2 (Blake) | General marketplace feedback; no direct weekly availability requirement. |
| Alaiya 3 (Precious) | General marketplace feedback; no direct weekly availability requirement. |
| Gia 1 (Malachi) | Convenience and student-specific discovery; preserve existing workflow. |
| Gia 2 (Lucas), Part 12 | Optional dedicated scheduling and specific campus meeting locations. |
| Gia 3 (Artemis), Part 8 | Public meeting locations and avoid unnecessary home/work address disclosure. |
| Cade 1 (Adarina) | General trust and convenience; no direct timeout requirement. |
| Cade 2 (Stephen), Q6–7 | Explicit weekly seller availability and comfortable public campus locations. |
| Cade 3 (Ethan), Q6–7 | Student trust and coordination; preserve messaging and external payments. |
| Taylor 1 (Cierra) | Rescheduled pickups, waiting, UC or library. |
| Taylor 2 (Jase) | University Center as comfortable location. |
| Taylor 3 (Emma) | Student union as comfortable location. |

Exact 48-hour/24-hour defaults and handover protection are engineering decisions informed by coordination/ghosting concerns, not numerical requirements elicited in interviews. Prior roadmap Package K requirements are implemented without replacing the transaction or messaging systems.

Campus references: https://www.uttyler.edu/student-life/university-center/ and https://www.uttyler.edu/library/ . No claim of official exchange-zone designation.

## Verification

`node --test` runs existing and new rule/API/worker tests. `psql -U postgres -d unimarket_dev -v ON_ERROR_STOP=1 -f test/meetups.integration.sql` tests the actual database using rollback fixtures (sequence counters may advance). Browser: save Wednesday 17:00–21:00, reload, use another student with an open offer to verify visibility, clear schedule, confirm suggestions populate the editable location, confirm a meetup and inspect the updated deadline. Use test accounts/listings; do not modify actual completed transactions. Verify that manual cancellation, completion, dispute and transaction notifications still work. On an expired test fixture, verify All transactions shows expired and the listing is active. Do not force expiration on real listings.
