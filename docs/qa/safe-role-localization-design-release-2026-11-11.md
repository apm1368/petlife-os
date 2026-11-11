# Safe role testing, localization, design and release checkpoint — 2026-11-11

Status: `PARTIAL`. This is a release checkpoint, not a product-wide acceptance report.

## Baseline and environment

- Repository: `apm1368/petlife-os`; base under test: `main` / production SHA `6fd4b60bc7b857b97da3fb70f53e8d599038047a`.
- The original `work` branch remains at `087ce3e9f0ebc8251cee6ade6f10a16609c7a650`; a separate candidate branch was created from the fetched main without modifying `work`.
- `git status` was clean before the candidate changes. No payment/travel worktree or `5614a4f8541def2091b15415fa66cdfa876af329` object was available in this workspace. This is not evidence that work in another workspace was deleted; no such work was removed here.
- Root disk had 7.4 GiB available before the frozen install and 4.1 GiB at final verification. Only dependencies and ignored build output were generated; no source, Git history, database volume or user data was deleted.
- Reproducible setup: `corepack pnpm@10.33.0 install --frozen-lockfile --prod=false`. Local runtime is Node 24.19.0; project requires Node >=20 and GitHub CI pins Node 20.
- No local PostgreSQL/Redis/Docker service or credentials for an authorized staging role fixture were available. GitHub CI has disposable PostGIS/PostgreSQL and Redis services and invokes `test:e2e:fresh`, which creates and drops databases whose names end in `_test`. No production role or customer data was used.

## Candidate change and checks

| Test ID | Route / area | Expected and actual | Status / evidence |
|---|---|---|---|
| LOC-PROVIDER-01 | `/{locale}/provider/availability` | Invalid persisted weekday values render explicit “unknown weekday” copy in fa/en/de/es instead of passing an undefined key; regression test covers all four locales. | PASS — `ProviderAvailabilityView.test.tsx` plus provider locale parity: 17 tests. |
| LOC-WEB-01 | Web route/component suite | Localized page behavior, error/empty states and navigation remain compatible with the `next-intl` v4 upgrade. | PASS — 316 files / 2,017 tests on the final candidate source tree. |
| LOC-WEB-02 | Web types and lint | Static types and lint accept the candidate. | PASS — `pnpm --filter @petlife/web typecheck`; full web lint; `git diff --check`. |
| LOC-WEB-03 | Production web build | All locale route output compiles and prerenders with a non-production API origin. | PASS — 765 static pages generated with `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:4000`; no production request was made. Next emitted cache-dependency warnings for its dynamic extractor import. |
| SEC-DEP-01 | Dependency graph / lockfile | Upgrade `next-intl` from 3.26.5 to 4.9.2, which supports the repository’s Next 15 / React 18 peer versions and clears the two next-intl advisories in the current lockfile audit. | PASS — exact-head PR CI `43084294705` succeeded; PR #254 merged at `5b40cd8f`; main CI and authorized deployment run `43086220899` succeeded. Fresh audit still leaves one moderate Nest Core advisory. |
| ROLE-API-01 | Owner/member, multi-household, invitations, health/document scope, seller/admin, provider/clinic, support/admin | Repository tests create isolated users/organizations and assert owner approval, membership independence, cross-household denial, grants/expiry, clinic scoping, seller review and role restrictions. | PASS for hosted API E2E suite on both exact PR head and merged main (`43084294705`, `43086220899`) using disposable CI Postgres/Redis. No private-role browser session was created. |
| ROLE-BROWSER-01 | Authenticated dashboard/account/household and scoped provider/support/admin pages | No authorized disposable browser account/session was available locally or in production. | BLOCKED — use exact-head CI API E2E as server-side evidence; a safe authenticated browser fixture/account remains required for true browser coverage. No production mutation was attempted. |
| DESIGN-01 | Dashboard/account/household/pet/health | Boards 13 and 15 and route-family documentation were inspected. Existing component tests cover substantial translated page states, but this batch did not capture a new authenticated rendered comparison at mobile/tablet/desktop or light/dark/simplified modes. | PARTIAL — no visual completion claim. Existing landing HERO source/composition was not edited. |
| PROD-01 | `https://opetlife.ir` | After release, `/api/health/version` reported `5b40cd8fc863c3bc537984f0674efa76bfe84b78` (`github-43086220899-1`); readiness returned `ok` with DB/Redis up; shop products and community posts returned empty lists. | PASS for exact SHA, readiness and empty-list behavior. No real product offer exists to verify shop visibility or checkout; no private workflow was exercised. |

## Localization/design coverage — not product-wide completion

| Page family | Current evidence | Status / missing acceptance |
|---|---|---|
| Dashboard/navigation | `MemberHomeView` component tests cover fa/en/de/es, household context, no-pet state, API failure/retry, permissions, sibling-pet isolation and translated body copy. | PARTIAL — authenticated browser flow, saved preference across refresh/navigation, rendered responsive/theme/simple-mode comparison not run in this batch. |
| Account/household/pet | Existing component/API regression suites cover account language, invitation approval/revocation, membership independence and access controls. | PARTIAL — no authorized private browser session or current-head disposable API E2E result yet. |
| Health/documents/care | Existing health, document, temporary-access and care-calendar suites remain in CI; fa/en/de/es slices exist. | PARTIAL — all routes/states and authenticated visual review are not verified. |
| Shop/seller/checkout | Shop/checkout/seller localization suites exist, but production shop API is empty. | PARTIAL — no real reviewed production offer, safe checkout procedure or current private-role browser run. |
| Services/provider | Provider discovery, selected booking and provider-console localization slices exist; this candidate adds a bounded invalid weekday state. | PARTIAL — provider console/availability still need authenticated browser and responsive/theme checks. |
| Support/community/backoffice | Existing localized slices and API authorization tests exist. | PARTIAL — current private/admin browser states were not exercised. |

German/Spanish SMS templates or delivery are not implemented or simulated. Source-authored product, provider, clinical, article and user content is not automatically translated. The entire application is not fully localized; English fallback outside explicit page-family slices remains a known gap.

## Dependency findings and release boundaries

- Fresh audit of the candidate frozen lockfile: `next-intl@4.9.2` no longer appears in the two previously reported advisory paths; `@nestjs/core@10.4.22` remains one moderate finding (GHSA-36xv-jgw5-4q75), fixed upstream at `>=11.1.18`. A Nest 10-to-11 major upgrade was not attempted. Source search found no `@Sse`, `SseStream`, `MessageEvent`, or SSE endpoint, but no exploit test was performed; the package advisory remains open.
- No migration/schema change was included. PR #254 was merged via rebase at `5b40cd8fc863c3bc537984f0674efa76bfe84b78`; main CI and deploy workflow `43086220899` completed successfully. Post-deploy version/readiness and public list checks match the merged SHA. This verifies the dependency update is deployed, not complete security or application acceptance.
- Production storage/CDN access for original memorial images remains unavailable; no claim about revoking direct source URLs or cached copies is made. The transient deployment 502 cause remains unconfirmed because host/proxy logs are unavailable.
- At initial inspection #121 and #132–#141 had old green checks on stale heads. #121's care-profile/calendar translation is already in current main through #157. Newer main commits also contain localized checkout/order, seller, health, care-suggestion, community, lost-pet and admin slices; do not replay stale stacked diffs. Confirm each older PR's unique diff against current main before closing or retargeting it.

## Next actions

1. Obtain an authorized disposable authenticated browser fixture/account and run dashboard/account/household, health/document, seller/admin, provider and support/admin flows. Hosted API E2E is server-side evidence, not browser acceptance.
2. Continue page-family localization and actual rendered comparisons in fa/en/de/es across mobile/tablet/desktop, light/dark and simplified modes; full-page localization/design remains PARTIAL.
3. Resolve/close old localization PRs only after checking their unique diffs against newer merged main slices; old green checks are not current evidence.
4. Reassess the remaining Nest SSE advisory after dependency/config changes or before a major Nest upgrade; do not call it exploited or fixed without evidence.
5. Retest production offer visibility/checkout only after a legitimate reviewed product and seller offer exist; the current production API has none.
