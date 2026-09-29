# Batch 5 — Travel, Trip Hub, Insurance and Places QA record

Branch `claude/batch-5-travel` from `0d1acb8` (live at start). Sub-batches 5A–5I are separate commits.

## Grade scale used in the route registry
- **A** — complete; verified on the isolated preview with seeded data in fa (RTL) and en (LTR) at 1440 and 390 (key pages also 360/430/768/1024): HTTP 200, correct `dir`, no horizontal overflow, no visible skeleton after load, no console errors; behaviour covered by automated tests.
- **B** — complete and covered by automated tests; rendered on the preview but not every state was inspected visually.
- **C** — honest degradation of a capability that depends on something that does not exist yet (stated on the page).

## Automated gates
| Gate | Result |
|---|---|
| `batch5-travel.e2e-spec.ts` | 18 / 18 — search filters/sort/pagination, pet match (dog/cat/weight/count/unknown/unstated), rate plans (required, modifier, deposit, min nights), compare/favorites shape, calendar scoped to listing, support link ownership, sandbox pay (failure then success) and price tampering, last-room race (exactly one hold), hold/request/payment expiry releasing nights, request accept/reject and partner isolation, cancellation refunds from snapshotted terms (free, non-refundable, provider = full), modification (same amount only, original kept on failure), booking IDOR (read/cancel/pay/modify/review/share), reviews (completed only, once, hide → rating), document share/revoke/expiry/cross-user/partner isolation, trip hub + requirement library provenance and staleness, partner listing lifecycle + admin moderation + audit + blackout, admin RBAC, insurer consent/isolation/transitions/needs-information, places PostGIS nearby + reports + audit |
| Full API e2e | green (all suites) |
| API unit, typecheck, lint | green |
| Web tests | 127 files / 447 tests green (Jalali calendar math incl. 6-year round-trip, picker keyboard/RTL/min-nights/unavailable nights, travel views, provider/admin/insurer views, insurance consent) |
| Web typecheck, lint, production build | green (pre-existing `<img>` warnings only) |

## Isolated preview
API `:4100` + web `:3100` on `petlife_b5_qa_test` (Redis DB 8) with seeds base, Batch 2, 3, 4 and 5. `seed-batch5.ts` is idempotent (ran twice), refuses non-`*_test` databases, and records no captured payment (seeded stays use pay-at-property rates). Requirement-library rows are labelled as QA samples.

### Browser flows (Playwright, 390)
- Pet hotel, pay at property: detail → pet chip → quote (2 nights 1,200,000 Toman) → reserve → 15-minute hold → pets → trip → review → confirmed. No page errors.
- Ramsar villa, “saver” PAY_NOW rate: quote 9,000,000 − 1,350,000 + 500,000 pet fee = 8,150,000 Toman → pay → confirmed. Database: booking CONFIRMED/PAID, total 81,500,000 IRR = pay-now = captured PaymentIntent amount.

### Page matrix
Traveller (home, results, detail, compare, favorites, trips, trip hub, booking detail ×2), partner (listings, editor, bookings, booking detail, reviews, finance), admin (listings, moderation detail, bookings, booking detail, reviews, requirement library, partners, analytics, insurance applications, places), insurer (portal, application) — all OK at 1440/390 fa+en; key pages OK at 360/430/768/1024.

### Findings fixed during QA
- Search counted units without rate plans as “free cancellation”, and compare fell back to “FREE_UNTIL” for such listings — an invented claim. Only explicit free-cancellation rate plans count now.
- Compare and favorites returned a different shape than search (favorites page crashed); both now use the search item builder.
- Public unit calendar did not check that the unit belongs to the requested published listing (could reveal an unpublished listing's calendar) — now 404.
- Partner availability writes had no range bound — capped at 366 nights.
- `move()` passed a relation `connect` into `updateMany`, so attaching a trip at submit failed with 500 — fixed with scalar input and covered by e2e.
- Results summary showed ISO dates in Persian; Trip Hub showed raw insurance statuses and a duplicated “Unknown” tag; booking references wrapped and flipped in RTL; “·” between Persian numbers risked bidi reordering; single-photo gallery left half the width empty; search form overflowed by 10px at 768 — all fixed.

## Known limits (documented, not faked)
Payments sandbox only (BLOCKED_EXTERNAL); partner payouts not automated; no map provider (list with distances); no hotel/airline integrations; requirement library ships empty in production; insurance is an application workflow only.
