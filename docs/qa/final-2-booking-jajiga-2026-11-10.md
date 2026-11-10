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

## Follow-up checkpoint — 2026-11-10 03:28 UTC

PR [#233](https://github.com/apm1368/petlife-os/pull/233) passed final-head CI `42746720628` on `5bdb43a7e85f9329d28b3864ab04e60f410059b5` and merged through normal squash at `156d5745540d625f08d1ce0196dfd55a5fa43966`. CI evidence includes 55 API unit suites / 309 tests and 80 real-DB HTTP E2E suites / 909 tests, including `batch3-booking`, `services-booking-depth`, `booking-access` and `travel-external`. No old local PASS was substituted for this head. Main release run `42748315022` has passed E2E and is building at this checkpoint; not yet declared deployed.

Fresh focused web verification on the same source: 10 suites / 71 tests PASS for booking creation/list/detail, provider bookings/detail/availability, discovery/profile and locale-key parity. Together with 19 travel UI tests recorded above, this does not establish every authenticated responsive or language state.

Production before the new release: version `b97acabaf2e5f1029a7069efc9b9dc0681bb1eed`, deployment `github-42746548143-1`; database/Redis readiness healthy. Bounded GET checks: external stays 200 with zero results; nonexistent outbound listing 404 without Location; anonymous favorites and bookings 401; provider discovery and service taxonomy 200. No production booking, charge, import or user record created.

### FINAL-TRAVEL-02 — saved-theme hydration mismatch (P2)

Anonymous Chromium probes of services and external travel in fa/en/de/es recorded React hydration errors with an explicitly stored LIGHT/DARK theme. A fresh context without the stored preference and an isolated reduced-motion context did not reproduce the service error. The theme store read localStorage during module initialization, so its server and client hydration snapshots differed. Fix: stable SYSTEM initial snapshot, restore saved preference after hydration, retain the existing prepaint script and reapply the current preference after navigation. Storage access failures safely retain SYSTEM. No theme/layout/HERO redesign or business-rule change.

Regression: hydration of server-rendered SYSTEM control with a saved DARK preference produces no recoverable error, then restores DARK; initial server snapshot stays SYSTEM. Theme restoration keeps locale, navigation reapplication and simplified display behavior. Eight focused theme/display tests, focused lint and web typecheck PASS. Production retest on the merged fix is still required; do not call this defect LIVE_VERIFIED yet.

### Browser evidence and limitations

[Eight screenshots and structured results](evidence/final-2-2026-11-10/results.json) are anonymous production evidence on `b97acabaf2e5f1029a7069efc9b9dc0681bb1eed`, captured with system Chromium and Python Playwright. Viewports: Persian 390×844 light, English 1440×900 light, German 768×1024 dark, Spanish 390×844 dark/simple; reduced motion enabled. Both `/services` and `/travel/external` return 200, direction is correct, and the rendered main text has zero Persian characters in en/de/es. No horizontal document overflow was observed. This is not proof of exhaustive translation: loading screenshots, clipped native select labels, header density and unstyled footer presentation still need follow-up; pending/error/dialog/authenticated states are not all visually accepted. Hydration errors remain FAIL on this old deployed revision, not a clean visual PASS.

Remaining acceptance: authenticated QA fixtures/account and isolated local API configuration are unavailable; ~171 MiB disk prevents a new full local production build. Hosted CI is available and used. Daily source import remains disabled until source/content permissions and fields are verified. Memorial source/CDN privacy remains unverified; no storage permissions or media were altered. All other worktrees and payment-related work remain untouched. #231 framework security upgrade has passed lint/typecheck/unit tests and is currently in E2E, not yet green or merged.
