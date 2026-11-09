# Stabilization pass — 2026-11-09 UTC

Scope: first evidence checkpoint of the owner's whole-product hardening mission, not release acceptance. Baseline main `d9d2189c0644d0ac8637b8d2179e94ff29b7a83f`; production tested at `7944df41d990a49364c45f1899bf6e245b43b778`. The difference is documentation only. Reuse the prior batch QA reports for history, not as fresh PASS for all routes. No financial transaction, account creation, import or customer-data mutation was performed.

## Findings and retests

| ID / priority | Requirement, environment, procedure | Expected / observed | Status and next action |
| --- | --- | --- | --- |
| HARD-SEO-01 / P2 | GC-02, four-language requirement; live GET `/robots.txt` and source `app/robots.ts` | Private crawl exclusions cover fa/en only, omitting de/es. Private layouts already carry noindex; this is a crawl-policy gap, not proof of unauthorized data disclosure. | Fixed using shared locale registry. New test covers sensitive account, pet, admin and financial routes in all four languages and preserves public discovery. 4 tests PASS locally; hosted CI and deployed robots check still required. |
| HARD-COPY-02 / P2 | PL-03/PL-10, GC-09; live travel metadata + source | de/es titles use English, hreflang only fa/en, no route canonical; description promises real availability despite unverified source/date context. | Four localized titles/descriptions, four hreflang alternatives and locale canonical added. Copy asks readers to confirm source price/availability/rules. 4 tests PASS locally; production retest required. |
| HARD-BROWSER-01 | Production Chromium via Playwright, `/fa/travel` 390×900, `/de/travel` 1440×900, `/es/travel` 390×900, `/en/travel` 768×900 | All returned 200; matching HTML language, fa RTL / others LTR; no document-width overflow at these viewports. de/es tab titles were English. | PASS only for the observed route/viewport checks; localization FAIL before fix. No authenticated, theme, simplified-mode or complete action acceptance inferred. |
| HARD-TEST-01 | Local, `pnpm exec vitest run app/robots.test.ts features/travel-market/TravelMetadata.test.ts` | 2 files / 8 tests passed. Focused ESLint and `git diff --check` passed. | PASS for changed policy/metadata logic; no schema change. Hosted production build remains required. |
| HARD-AUTH-01 | Anonymous production GETs, baseline production SHA; no response bodies retained | `/api/households`, `/api/bookings`, `/api/orders`, `/api/admin/users` returned 401. `/api/pets` and `/api/wallet` returned 404 and establish no permission coverage. | PASS for anonymous rejection on the four 401 routes only. Cross-user/role IDOR remains NOT_TESTED in this pass. |
| HARD-HEADERS-01 | Production HEAD `/de/travel` | HTTP 200, HSTS `max-age=31536000`; no CSP/X-Frame-Options/nosniff/referrer-policy HTTP headers observed in this response. | PARTIAL. Review middleware/proxy/embedding requirements before a coherent security-header change. This observation alone does not prove an exploitable vulnerability. |

Screenshots: [Persian mobile](travel-fa-390.png), [German desktop](travel-de-1440.png). Both capture public pre-fix pages and contain no customer records. Browser testing works with `/usr/bin/chromium`; earlier reports of no browser capability must not be reused as a current blocker. No QA credentials are configured in the environment, so authenticated checks still require an isolated test setup.

## Coverage and evidence reuse

`../hardening-route-inventory-2026-11-09.json` inventories every source page at the baseline SHA, generated with `node docs/qa/build-hardening-inventory.mjs`. NOT_TESTED means not accepted in this pass; it does not erase prior tests. Resolve each row against `../final-hardening/`, `../security-verification-2026-10.md`, batch QA and `../../product/localization-rollout.md`, then record change-impact reasoning before reusing evidence. Route presence is not functionality or permission acceptance. API/action mappings, theme/viewport coverage and authenticated acceptance remain incomplete.

## Content benchmark

Observed 2026-11-09: [GOV.UK Error summary](https://design-system.service.gov.uk/components/error-summary/) was publicly accessible. Its guidance puts a summary above the page heading and moves keyboard focus to the error summary. Recommendation for the next form audit: verify actionable summaries, focus and field-linked errors on signup/checkout/booking; no competitor wording or assets copied. [Rover how-it-works](https://www.rover.com/how-it-works/) returned 404; no product claims or recommendations inferred from that response. This is a limited benchmark, not a completed competitive review.

## Release blockers and next work

- Whole-product acceptance is NOT complete. Prioritize isolated authentication/household IDOR and financial replay/approval suites, then browser-test dashboard/account/health/checkout using controlled test accounts. Do not run real transactions.
- Complete route-level localization and state testing; four-language catalogs and headers do not establish full-page acceptance. German/Spanish SMS configuration remains outside this pass.
- Production bucket/CDN access is absent; independent memorial source-image/cache revocation remains unverified. Do not promise full image revocation.
- Real catalog/provider/stay data are absent from the last public checks; empty states cannot establish purchase/booking availability. No new partner connection is authorized by this phase.
- Disk: 139 MiB free before this pass; no cleanup or active volume changes. Existing worktrees preserved. No payment-named worktree found; absence is not deletion evidence. Use hosted CI for builds and avoid dependency installs until capacity is resolved.

## Owner review checklist after verified release

1. Switch fa/en/de/es, navigate and refresh dashboard/account; report route plus remaining mixed-language text.
2. Invite a controlled account, request membership, approve it, switch households and remove only that membership.
3. Select multiple pets, edit a pet photo and check health/document access as owner versus member.
4. Inspect real catalog and provider data when available; empty inventory is expected until legitimate data exists.
5. Check travel source links and stale/unknown pet-policy wording; source booking remains external.
6. Check mobile and desktop, light/dark and simplified display, keyboard focus and error recovery.

Remaining financial, authenticated, accessibility, performance, design-board, technical SEO and security checks must be tracked separately. No full-security or launch-readiness claim is made.
