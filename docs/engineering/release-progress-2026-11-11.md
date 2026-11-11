# Release progress — 2026-11-11

Status: `PARTIAL`. This records the current verified checkpoint; it is not a product-wide release-readiness declaration.

## Current release

- `main`: `5b40cd8fc863c3bc537984f0674efa76bfe84b78`.
- Production `/api/health/version`: same SHA; deployment `github-43086220899-1`.
- Production readiness: `ok`; database and Redis report `up`.
- PR #254 (`fix/security: upgrade next-intl and localize invalid weekdays`) merged by the repository's normal rebase path. Exact-head CI run `43084294705` passed; main CI and deployment run `43086220899` passed, including disposable API E2E, production build, health/version smoke and public asset verification.
- No schema migration was added. The existing release script takes a PostgreSQL backup before migrations and restores the prior build if build/health checks fail.
- Safe production GETs after release: `/api/shop/products` and `/api/community/posts` return empty lists. This supports fixture exclusion only; no real reviewed product/offer exists to validate product visibility or checkout.

## Work in this checkpoint

- Updated `next-intl` to 4.9.2 after verifying compatibility via full web tests/typecheck/lint/build and hosted CI. The two `next-intl` advisories disappeared from the fresh production lockfile audit.
- Added fa/en/de/es labels and regression tests for invalid persisted provider weekday values. This is a narrow localized error-state fix, not full provider-page completion.
- Local verification: frozen pnpm 10.33.0 install; focused provider/parity tests (17); full web suite (316 files / 2,017 tests); web typecheck/lint; production build (765 static pages, using a local API-origin placeholder); diff check. Hosted CI on PR and main also passed.
- Fresh production audit still reports one moderate `@nestjs/core@10.4.22` SSE advisory (GHSA-36xv-jgw5-4q75; upstream fix >=11.1.18). No SSE endpoint/use was found in source search and no exploit was reproduced. Keep open; no Nest major upgrade was attempted.
- See [QA checkpoint](../qa/safe-role-localization-design-release-2026-11-11.md) and [dependency review](../qa/dependency-audit-2026-11-11.md).

## Environment and preserved work

- Workspace `/workspace/petlife-os`; final available root space 4.1 GiB (7.4 GiB before install/build). Only ignored dependencies/build artifacts were generated.
- Branch `work` at `087ce3e9f0ebc8251cee6ade6f10a16609c7a650` was preserved. The #243 commit `5614a4f8541def2091b15415fa66cdfa876af329` and separate payment/travel worktrees were not present in this workspace; absence here does not establish deletion elsewhere. No such work was removed.
- No local Postgres/Redis/Docker services or authorized private-role browser credentials were available. CI supplied disposable PostGIS/PostgreSQL and Redis for its API E2E suite. Browser UI verification remains blocked pending safe authorized accounts/fixtures.

## Remaining status and next actions

1. Keep whole-page fa/en/de/es localization and design acceptance `PARTIAL`. Run authenticated browser tests and visual comparisons with an authorized disposable fixture across RTL/LTR, mobile/tablet/desktop, light/dark and simplified display.
2. Reconcile old stacked localization PRs against current main before retargeting/closing. #121 care profile/calendar changes are already represented in current main through #157; newer main commits also contain several corresponding checkout, orders, health, seller, support, community and admin slices. Do not treat old green CI as current evidence or replay stale history wholesale.
3. Keep the remaining Nest advisory open pending a compatible fix or an explicit accepted-risk decision. Re-audit after dependency/config changes.
4. Shop visibility/checkout needs legitimate reviewed product data and seller offer; production is currently empty. Never reintroduce demo inventory.
5. Original memorial source-image/direct URL/CDN privacy remains unverified because authorized bucket/CDN configuration access is unavailable. Memorial withdrawal does not establish source-object revocation.
6. Cause of the earlier transient deployment 502 remains unconfirmed; deployment/proxy logs are not available from this environment. Continue monitoring and do not claim a fix.

The existing landing HERO was not edited. No new provider integration, editorial campaign, Android or iOS work was started.
