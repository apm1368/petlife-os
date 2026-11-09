# Member dashboard — Batch 1 QA record (2026-11-09)

This is a focused verification record, not a claim that the authenticated dashboard has passed visual QA or is fully live-verified.

## Latest recheck — 2026-11-09 15:14 UTC

- PR #219 was merged normally by squash at `4a4623ef01bc01f34737ac748ed782ee4cb71876`. The exact PR-head CI run [42638498352](https://github.com/apm1368/petlife-os/actions/runs/42638498352) passed. The post-merge `main` run [42641104811](https://github.com/apm1368/petlife-os/actions/runs/42641104811) passed lint, design-system/visual checks, typecheck, migrations and tests; API E2E was still in progress at this check and build/deploy had not completed.
- `main` is the merge SHA above. Production still reports `ad71226127ddf2b6a98c38d443a78805a8a632de` (`github-42634490099-1`); `/api/health/ready` returns 200 with DB and Redis up. Anonymous `GET /fa/home` returns HTTP 200 but is not authenticated dashboard evidence. The dashboard remains **MERGED_NOT_DEPLOYED / PARTIAL** pending exact-main pipeline, deploy SHA, and authenticated behavior verification.
- Tried a fresh local rendered capture from the merged source using the existing Next dev app. It compiled the locale shell but the dashboard route did not return after more than six minutes; the attempt consumed additional disk (available space moved from about 568 MiB to about 466 MiB), so the server was stopped to preserve capacity. No screenshots were captured for this SHA. Historical `member-glass` screenshots and the approved design source are not substituted for current rendered evidence.
- `MemberHomeView.test.tsx` remains 27/27 passed; the member navigation/shell/theme/simplified-mode tests remain 32/32; web typecheck, focused ESLint and `git diff --check` passed before merge. Hosted CI on PR head also passed its required build check. Saved-language preference through authenticated navigation/refresh and visual screenshot checks remain **NOT TESTED/BLOCKED**, not passed.
- Current resource status after stopping the dev server: approximately 466 MiB free. No other worktrees were altered.

## Production recheck — 2026-11-09 15:26 UTC

- The post-merge pipeline [42641104811](https://github.com/apm1368/petlife-os/actions/runs/42641104811) completed successfully: all CI steps passed (including API E2E and production build), then the authorized deploy job passed.
- Production `/api/health/version` reports `4a4623ef01bc01f34737ac748ed782ee4cb71876`, `github-42641104811-1`, environment `production`; `/api/health/ready` returns 200 with database and Redis `up`.
- Anonymous `GET https://opetlife.ir/fa/home` returned HTTP 200. This verifies route availability only. No authenticated account/session was available, so active-household display, saved-language persistence, dashboard data, and user permissions were not exercised on production.
- Release state: **MERGED_AND_DEPLOYED / PARTIAL**, not **LIVE_VERIFIED** for the authenticated dashboard flow. The added local visual capture remains blocked as described above; no screenshot from this SHA is claimed.

## Code and environment

- Code under test: `beccb7c4099c5b85ce942c1e7371b5c0c212ad00` (`feat/dashboard-batch1-handoff`), based on `origin/main` `ad71226127ddf2b6a98c38d443a78805a8a632de`.
- Product route: `/[locale]/home`; related shell: member navigation, theme sync, display-mode sync, and `DesignRoot`.
- Production observation: `https://opetlife.ir/api/health/ready` returned `200` with database and Redis `up`; `/api/health/version` reported `b7d3d467d470790f842d5f37084d93a4e8f78e8b` (`github-42632542161-1`). Production is behind tested `main`.
- Exact-main pipeline: GitHub Actions run [42634490099](https://github.com/apm1368/petlife-os/actions/runs/42634490099), head `ad712261…`; at 2026-11-09 14:48 UTC, lint, design-system contract/visual stories, typecheck, migrations and unit tests had passed; API E2E was in progress and production build pending. No pending result is treated as pass.
- Workspace: Linux, 74 MiB free at inspection. No local `.next` output was present; no browser/dev build was started because it could exhaust the filesystem. Existing worktrees were preserved.

## Results

| Test ID | Area / requirement | Environment and procedure | Expected | Actual / status | Evidence / next action |
|---|---|---|---|---|---|
| DB-01 | Dashboard content, loading/empty/failure states, pet scoping, permissions, locale rendering; DS-02/06, GC-09/10, ID-21 | Local Vitest at the code SHA above: `pnpm --filter @petlife/web exec vitest run features/home/MemberHomeView.test.tsx --reporter=dot` | Real selected-pet data, no sibling appointment leakage, permission-filtered links, localized application UI and honest empty/retry states | **PASS** — 1 file, 27 tests | Includes active-household label in fa/en/de/es and no display without confirmed identity permission. Automated component evidence only; not an authenticated browser test. |
| DB-02 | Desktop/mobile navigation, themes, simplified display and shared personal surface; UX-04/11, DS-14, PL-08 | Local Vitest: `pnpm --filter @petlife/web exec vitest run features/navigation/MemberNavigation.test.tsx features/app-shell/member-surface.test.ts features/display-mode/DisplayModeSync.test.tsx features/display-mode/DisplayModeToggle.test.tsx features/theme/ThemeSync.test.tsx --reporter=dot` | Controls retain behavior and route semantics; theme/display settings synchronize; shared member shell remains available | **PASS** — 5 files, 32 tests | Component/state tests do not replace rendered screenshots or visual inspection at mobile/tablet/desktop. |
| DB-03 | Type and style safety | `pnpm --filter @petlife/web typecheck`; focused ESLint on `MemberHomeView.tsx`, `GlassMemberHome.tsx`, `glass-home-copy.ts`, and `MemberHomeView.test.tsx`; `git diff --check` | No type, lint or whitespace errors | **PASS** | Exact-head hosted build remains the release gate. |
| DB-04 | Production readiness and release SHA | Read-only `curl` to readiness/version endpoints | Production reports ready services and the expected deployed SHA | **PARTIAL** — readiness is healthy, but production is at `54caf027…`, not current main `ad712261…` | Wait for run 42634490099 and verify its authorized deploy, version SHA and readiness afterward. |
| DB-05 | Authenticated dashboard visuals, fa RTL + LTR, light/dark, normal/simplified, mobile/desktop; DS-12, DS-14, UX-11 | Browser session unavailable; local build/capture deferred due 74 MiB free. Existing historical captures are under `apps/web/design-review/member-glass/` (`home-fa/en-{390,1440}.webp` and `before-fa-{390,1440}.webp`). | Fresh screenshots and visual review at the requested combinations, tied to the exact tested SHA | **BLOCKED / NOT TESTED on this SHA** — historical captures predate the current SHA and cannot be represented as fresh evidence | Need a safe authenticated member account/session and enough disk for the app/browser run. Reuse old captures only as historical context, not as a pass. |
| DB-06 | Persisted language preference through navigation and refresh | Locale-specific component tests render fa/en/de/es, but no authenticated browser session was available | Saved preference survives route change and refresh | **NOT TESTED** | Verify in an authenticated browser; do not infer persistence from static locale component rendering. |

## Current implementation and scope

- PR #153 is merged at `d5599bd82047bd0b47dcc70c4cd6b25537a0a8b0` and already provides member dashboard/account fa/en/de/es copy; dashboard translation was not duplicated.
- PR #210 is merged at `a5c7a6b830130f3e8ad500b83742033345ca3727` and provides dashboard/shared-pattern styling. The dashboard uses existing read APIs for the selected pet, care events, bookings, orders, membership and stays; tests assert that no sample metric or sibling-pet booking is substituted. This batch displays `overview.householdName` as an active-household context only after `canViewIdentity` is confirmed; it adds no API or household-switch behavior.
- Existing localization rollout marks fa/en dashboard copy complete and de/es partial pending authenticated browser inspection. User-authored and source-authored names/plans remain source content; a de/es plan name may remain English and is labeled accordingly.
- Design source inspected: `docs/design/product-design-reference.md`, reference boards 01 and 15, and `apps/web/design-review/approved-rollout/targets/member-home.webp`. The target's people, pet, events, and numbers are illustrative only. No landing HERO code or image was changed in this batch.

## Release status

PR #219 is merged and deployed at `4a4623ef…` by run `42641104811`; production version and readiness were checked. Overall dashboard status remains **PARTIAL / NOT LIVE_VERIFIED** until authenticated rendered behavior and current screenshots are checked. Do not mark visual QA complete based only on component tests, anonymous route status or old screenshots.

Decision references: DS-01–DS-10, DS-14–DS-15, UX-04, UX-11, GC-09, GC-10, PL-04, PL-08, PL-11.
