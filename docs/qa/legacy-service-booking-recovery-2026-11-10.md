# Legacy service booking recovery — 2026-11-10 UTC

Baseline: `b9b43e73572f353aa53ba6f081682282e2b023c3`. Decisions: B-01..B-09, DS-06, GC-09/GC-10. No booking, payment, authorization, schema or HERO changes.

`FINAL2-BOOKING-03` (P2): the old per-service booking link treated every lookup failure as a permanently missing service. It offered no retry and used English for German/Spanish. A late response could also navigate after the visitor had left the page.

Only an actual API 404 now renders the four-language unavailable state. Network/other errors render localized recovery with Retry; loading is labelled. A successful retry keeps the locale/service context and redirects to the existing provider booking flow. Effect cleanup suppresses stale updates/navigation. Service/provider route values are encoded. No availability, reservation or payment result is invented.

Verification: 18/18 tests PASS (7 redirect/recovery cases including four-language 404, German/Spanish retry and stale unmount; 9 existing booking-creation tests; 2 complete booking catalog/placeholder parity tests). Focused ESLint, web typecheck and diff checks PASS. Exact-head hosted CI/build must be green before merge. Existing error texts and business rules in the canonical booking flow are unchanged.

Status: IMPLEMENTED_AND_LOCALLY_TESTED, NOT LIVE. No production booking or charge. Final browser checks after deploy: missing service displays localized unavailable, transient lookup failure is recoverable without claiming permanent removal, successful deep link retains locale/service, back/unmount does not later redirect. Full authenticated booking/theme/responsive acceptance remains PARTIAL without an authorized QA account and fixtures.
