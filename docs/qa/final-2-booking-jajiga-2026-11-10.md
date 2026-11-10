# Final batch 2/6 — booking and Jajiga checkpoint

Baseline code inspected: `a8079ead045ae41f2a9162e4c9713189b6317076`, production version endpoint matched that SHA on initial inspection. Existing worktrees and committed/uncommitted work preserved. Read decisions B-01..B-09, BK-01..BK-20, OF-11, PL-03/PL-10; product-design reference, booking reference/previous batch-4 evidence and current source inspected. No new booking/payment/ledger system, schema migration, source import, production reservation or charge.

## FINAL-TRAVEL-01 — P2 unpublished content leaked through saved stays

The public directory/detail/outbound path enforced publication, but favorites and private trip plans returned the current full stay even after it became draft/rejected/hidden. A previous bookmark could therefore expose unreviewed title, location, media and policy revisions. Saved-reference ownership is not permission to view unpublished source content.

Favorites and trip plans now retain only the stay ID/removal handle when not both PUBLISHED and ACTIVE/STALE. Unavailable trip price output is null. New favorites also require public lifecycle eligibility. UI uses existing shared surfaces and localized unavailable/remove copy and preserves saved plans without rendering unpublished fields. Available cards retain source links, timestamps and quote context. No source or user's saved data is deleted. No HERO change.

Verification: 11/11 API tests PASS (Jajiga adapter and public service moderation, including draft/rejected favorites and draft trip plan redaction). 19/19 UI tests PASS across saved stays, trip plans, search and cards; deletion failure retains the handle, trip removal permissions remain intact and no unpublished source link renders. Web TypeScript check and focused API/web ESLint and diff checks PASS. Extended real-DB HTTP E2E asserts exact `{id}` redaction in both favorites and trip-plan results after hiding a stay; hosted CI must pass before merge. Local API E2E/build not run due no isolated configured API DB and limited disk (~171 MiB).

## Small read-only source pilot — 2026-11-10 UTC

Robots GET: allows `/`, disallows `/i/*` and tracking patterns. One permitted public pet-filter search GET, `https://www.jajiga.com/s?rule%5B0%5D=pet`, returned 260,615 bytes of SSR HTML. Six first-page cards discovered; one explicit `is_pet_friendly` marker; five skipped under current adapter rule; zero imports and zero fetch/JSON parse failures. One marked candidate remains evidence only; it was not published or ingested into production.

Observed fields: id, URL/short URL, title, city/province, guest/max-guest counts, bedrooms, floor area, price/min-price/discount fields, pictures, rating and properties. No date/guest-specific quotation or available inventory was established. Raw price/picture presence does not establish usable quote context or reuse rights; no descriptions/images/prices copied. This sample does not demonstrate nationwide coverage. Source terms/content rights, exact pet rules and dated availability remain unverified; daily production sync was not enabled by the pilot.

## Existing workflows and remaining acceptance

Booking lifecycle uses conditional state transitions, separate clinical records, capacity release and permission checks. The service/booking/provider tests and coverage in the prior batch-4 record are historical evidence for unchanged code; this patch changes saved external-stay presentation/authorization, not booking or refund behavior. No fresh full booking lifecycle/household isolation PASS is claimed. Source-only review of state transitions is not concurrency acceptance.

Full fa/en/de/es, light/dark/simplified and mobile/tablet/desktop authenticated browser comparison remains PARTIAL; this slice reuses existing four-language unavailable/remove strings. No new screenshot was captured for changed authenticated screens. Prior anonymous travel screenshots do not establish the updated behavior. Next: hosted travel E2E, authenticated isolated fixtures for saved stay/plan removal and all display modes, booking create/cancel/reschedule/duplicate/slot races and grant expiry, then safe production verification after merge/deploy.

Integration: seller/catalog #232 passed CI and merged normally at `b97acabaf2e5f1029a7069efc9b9dc0681bb1eed`; deployment is not yet verified. #227/#229 had been updated using GitHub's protected update-branch operation; their checks must be reevaluated against current main before merge. #230 is open. #231 security dependency upgrade is blocked on confirmed Next ESLint compatibility failures; critical/high dependency readiness findings remain open until tested fixes land. No branch protection bypass.

Current privacy fix status: IMPLEMENTED_AND_LOCALLY_TESTED, NOT LIVE. Production published external stay API returned zero items, so real published-stay behavior cannot be smoke-tested without approved source data. Do not fabricate inventory for acceptance.
