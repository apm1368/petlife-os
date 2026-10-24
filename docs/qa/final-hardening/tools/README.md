# Final hardening QA tools (isolated preview only)

Run against the preview (web :3100 → API :4100) on a `*_test` database loaded with every batch QA seed
(`seed-batch2/3/4/5/6/8.ts`, idempotent). Each script refuses to run on a non-`_test` database and never
prints session values. Needs Playwright + axe-core (`/opt/petlife-qa/node_modules`) and the preview env
(`DATABASE_URL`, `SESSION_SECRET`) plus `PRISMA_CLIENT=<apps/api>/node_modules/@prisma/client`.

| Script | What it proves |
|---|---|
| `crawl-final.js` | Every web page route (`ROUTES` = list of `app/[locale]` page paths), dynamic segments filled from real rows and opened as a persona that should see them. Records HTTP status, redirects, page/console errors, failed API calls, stuck skeletons, system state, overflow, `dir`, raw enum codes and Latin digits in fa. |
| `smoke-final.js` | Ten flows through the real API as the right persona, then checked in the rendered page (fa, 390 px): OTP sign-in through the UI, account, pet, health, services booking → pay, checkout → pay → order → cancel/refund, travel hold → pay, lost-pet report (no private address in public payload), animal-support offer + not-found state, donation receipt. |
| `a11y-final.js` | axe WCAG 2.1 A/AA + overflow on the pages touched by the hardening pass, fa + en, 1440 + 390. |

The cross-domain IDOR sweep is not here: it runs in CI as `apps/api/test/final-cross-domain-security.e2e-spec.ts`.
