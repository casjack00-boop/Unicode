# Package J — Advanced profiles and personalisation

## Migration and setup

After the existing migrations through `db/reputation.sql`, apply `db/personalisation.sql` with `psql -v ON_ERROR_STOP=1` to the existing database. Do not recreate or reseed it. The migration adds an optional 500-character biography and a default-off recommendation preference to `users`, and an index on completed buyer deals. It reuses `recently_viewed_listings`, `marketplace_deals`, `user_blocks`, `listing_photos` and the existing `pg_trgm` extension. No npm packages or external services are required.

## Behaviour and privacy

- **Biography:** profile owner can save, edit or clear plain text. Other authenticated verified students can see it on the profile. It is not a private note. Existing email visibility and ratings remain unchanged. Omitting `biography` in a legacy profile update retains the saved text.
- **Personalisation:** off by default. Browse has a separate Recommended for you panel in the unfiltered Best match view. Enable it in Settings > Recommendation privacy. Account preference is persisted server-side and follows the authenticated student. No new events, cookies, third-party analytics or model are introduced. Personal API responses use `private, no-store`.
- **Signals:** at most the existing 20 recent item views from the last 30 days. Same ISBN or strong title similarity within category ranks ahead of category-only matches. At most six results; recency and ID provide stable tie-breaking. Already-viewed items, self-owned items, non-active items, unverified sellers and blocked pairs are omitted. Direct item views, not search queries, are signals; ordinary search results remain available at all times.
- **Purchases:** completed deals are authoritative; the stored transaction snapshot is used even if a listing is later edited. Exact purchased listing IDs are always excluded. Strongly matching products are excluded until a later matching item view after the completed purchase. This is a heuristic, not a product taxonomy: it may miss differently named equivalents or overmatch related titles. Declined or cancelled offers do not suppress suggestions. Generic item-to-item suggestions, academic department discovery and ordinary search are unchanged.
- **Opt-out:** stops personalised results, without deleting the pre-existing private Recently viewed feature. Its existing Clear history action also removes recommendation signals. This setting does not control other independently configured features such as academic preferences or saved-search alerts. Browsing history and purchase history are never exposed through public profile responses.

## API contract

All routes below require the existing verified session cookie. Identity is derived from `req.user.id`, not a body/query user ID.

| Method and path | Request | Success response |
|---|---|---|
| GET `/api/profiles/me` | None | Existing `{user,listings}`; user adds `biography` |
| GET `/api/profiles/:id` | Student ID | Public `{user,listings}`; user adds `biography`, no email or recommendation consent |
| PATCH `/api/profiles/me` | `{display_name,housing,biography?}` | `{ok:true,user}`; optional string up to 500 characters, empty clears |
| GET `/api/discovery/recommendation-preferences` | None | `{enabled:boolean}` |
| PUT `/api/discovery/recommendation-preferences` | `{enabled:boolean}` | `{enabled:boolean}` |
| GET `/api/discovery/recommendations` | None | `{enabled:boolean,listings:[{id,title,price_cents,category,condition,status,photo_url}]}`; empty if disabled/no relevant items |

Invalid inputs receive 400, absent/expired sessions 401, and missing verified accounts 404. SQL parameters are used throughout. User biography is rendered with `textContent`.

## Interview cross-reference (18 interviews)

Source: team `Interview Transcriptions.md`. This is a Package J-specific review, not the final Package N requirements traceability matrix. Direct evidence for browsing personalisation and purchase exclusions is the Artemis exchange. Biography is a roadmap addition rather than a claim that all interviewees requested it. Related requests from other interviews are kept distinct.

| Interview | Relevant evidence and disposition |
|---|---|
| Kenny 1 (Alex) | Existing marketplace features considered sufficient; keep personalisation optional and ordinary marketplace intact. |
| Kenny 2 (Starlla) | Suggested pricing; already Package B, not another recommendation feature. |
| Kenny 3 (Jayce) | Similar-item comparison; preserve Package B contextual similar items; J adds account-specific discovery. |
| Cassidy 1 (anonymous) | Filter by quality/price and safe meetups; retain filters and defer meetup work to K. |
| Cassidy 2 (anonymous) | Trustworthy sellers and ratings; retain I and exclude unverified/blocked sellers from J. |
| Cassidy 3 (anonymous) | Verified student marketplace increases trust; preserve session gate. |
| Alaiya 1 (Deborah) | Categories, price filters, photos, condition and availability; keep ordinary search and show only active recommendations. |
| Alaiya 2 (Blake) | Legitimacy, private messaging, reporting and ratings; keep F/I and use existing block rules. |
| Alaiya 3 (Precious) | Categories, favorites and matching notifications; retain B/E as distinct features. |
| Gia 1 (Malachi) | Major/course relevance, typo-tolerant search and ISBN; preserve H/B and use exact ISBN as a J ranking signal. |
| Gia 2 (Lucas) | Saved-item alerts and relisting purchases; retain E/D/H and reuse transaction snapshots. |
| Gia 3 (Artemis), Part 5 | Directly endorses previously viewed recommendations; privacy and stopping similar recommendations after purchase discussed and accepted. J implements opt-in, suppression and renewed view. |
| Cade 1 (Adarina/Rina) | Customer support and alerts; retain E, support planned for L. |
| Cade 2 (Stephen) | Written reviews on profiles and meetup availability; preserve I and defer scheduling to K. |
| Cade 3 (Ethan) | Student-relevant items, secure external payments and safeguards; retain student scope, do not collect payment info in biography. |
| Taylor 1 (Cierra) | Student exchanges and safety; maintain verified marketplace, no new J-specific request. |
| Taylor 2 (Jase) | Weekly popular items; preserve H trending rather than duplicate it. |
| Taylor 3 (Emma) | Finding affordable items and concern about submitting personal details; retain search/price tools, default-off J and public bio warning. |

## Tests

Run `node --test` from repository root. The route suite uses mock database responses; it verifies input validation, ownership, consent, private cache headers, public profile fields and plain-text biography rendering. It does not execute PostgreSQL statements. Run `psql -U <your-user> -d unimarket_dev -v ON_ERROR_STOP=1 -f test/personalisation.integration.sql` separately against a development database after migration; fixtures roll back (sequences can advance). PostgreSQL integration and Firefox verification must be performed locally before publishing.

Manual check: save/reload/edit/clear a biography, check it from another student, enable/disable recommendations, view a listing and return to Browse, inspect recommendations, complete a test purchase and check comparable suppression, view another comparable listing and check renewed interest, clear history, verify other-account isolation and normal search/ratings. Check signed-out requests and light/dark/large text appearance. Test with existing accounts or dedicated development fixtures; don't create production purchases merely to test recommendations.
