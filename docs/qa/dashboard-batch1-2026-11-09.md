# Member dashboard — Batch 1 QA record (2026-11-09)

This is a focused verification record, not a claim that the authenticated dashboard has passed visual QA or is fully live-verified.

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

**AWAITING_CI_OR_MERGE** is not applicable to dashboard feature code already on main; its current-main deployment is pending the exact-main pipeline. Overall dashboard status remains **PARTIAL / NOT LIVE_VERIFIED** until deployed SHA and authenticated rendered behavior are checked. Do not mark visual QA complete based only on component tests or old screenshots.

Decision references: DS-01–DS-10, DS-14–DS-15, UX-04, UX-11, GC-09, GC-10, PL-04, PL-08, PL-11.
