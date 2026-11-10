# Legacy service booking recovery — 2026-11-10 UTC

Baseline: `b9b43e73572f353aa53ba6f081682282e2b023c3`. Decisions: B-01..B-09, DS-06, GC-09/GC-10. No booking, payment, authorization, schema or HERO changes.

`FINAL2-BOOKING-03` (P2): the old per-service booking link treated every lookup failure as a permanently missing service. It offered no retry and used English for German/Spanish. A late response could also navigate after the visitor had left the page.

Only an actual API 404 now renders the four-language unavailable state. Network/other errors render localized recovery with Retry; loading is labelled. A successful retry keeps the locale/service context and redirects to the existing provider booking flow. Effect cleanup suppresses stale updates/navigation. Service/provider route values are encoded. No availability, reservation or payment result is invented.

Verification: 18/18 tests PASS (7 redirect/recovery cases including four-language 404, German/Spanish retry and stale unmount; 9 existing booking-creation tests; 2 complete booking catalog/placeholder parity tests). Focused ESLint, web typecheck and diff checks PASS. Exact-head hosted CI/build must be green before merge. Existing error texts and business rules in the canonical booking flow are unchanged.

Status: IMPLEMENTED_AND_LOCALLY_TESTED, NOT LIVE. No production booking or charge. Final browser checks after deploy: missing service displays localized unavailable, transient lookup failure is recoverable without claiming permanent removal, successful deep link retains locale/service, back/unmount does not later redirect. Full authenticated booking/theme/responsive acceptance remains PARTIAL without an authorized QA account and fixtures.

## Stable production reproduction — 2026-11-10 04:15 UTC

After #234 completed, production SHA `b9b43e73572f353aa53ba6f081682282e2b023c3` rendered the negative-control route `/de/services/VET/00000000-0000-4000-8000-000000000001/book` and Spanish equivalent with HTTP 200, but both displayed the English unavailable-service message. Localization is FAIL for this state despite HTTP 200. Anonymous Chromium at 390×844; no booking or user data created. [German before](evidence/final-2-2026-11-10/legacy-before/de.png), [Spanish before](evidence/final-2-2026-11-10/legacy-before/es.png).

PR #235 passed full Next 15 CI/build `42752198178` on synchronized head `00acfafba7ee798588e72bb3b29484e78c22a0fd` and merged normally at `e2a38cb5035088e099ef8a5b7e492cd0d0ce24ce`. Main pipeline `42753996987` remains in E2E at this checkpoint. This does not mark the production defect fixed yet. Retest with `docs/qa/tools/final2-public-smoke.py --expected-sha e2a38cb5035088e099ef8a5b7e492cd0d0ce24ce --output-dir /tmp/final2-e2a38cb5 --legacy` only after actual deployment.

## Final retest — 2026-11-10 04:32 UTC

Pipeline `42753996987` succeeded; API version and main match `e2a38cb5035088e099ef8a5b7e492cd0d0ce24ce`. The SHA-bound script recorded 18/18 safe production checks PASS, including this negative-control route in fa/en/de/es with HTTP 200 and each exact localized unavailable message. [Final structured results/screenshots](evidence/final-2-2026-11-10/final-release/results.json). The bounded missing-service translation defect is LIVE_VERIFIED fixed; no transient build 500 on these final checks. Network Retry and stale unmount remain meaningfully unit-tested, not falsely described as a completed production reservation. Whole authenticated booking, source availability and visual/accessibility coverage remain PARTIAL as detailed in the batch QA record.
