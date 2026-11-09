# PET LIFE OS progress handoff — 2026-11-09

Point-in-time checkpoint only. Recheck GitHub, CI and production before each merge or release.

## Release state

- `main`: `07c2ac246e344f0eac9e319449801c2e9df88df9`, after #203 merged normally. Production `/api/health/version` last returned `c1c8bf530c384e7eef08cbeb2c9c78fcb7eecbda` (deployment `github-42582860438-1`). Main CI for `07c2ac24` is running as `42584955441`; production release is pending. Recheck before claiming #203 live.
- Main CI/deploy for #196 (`42582860438`, SHA `c1c8bf5…`) completed successfully; the deployed SHA was verified on production. #202 (`3097163…`) was superseded by that release.
- #199's first main deployment failed in unit tests due to a race in `TravelFavoritesView.test.tsx`. #202 fixed the test and merged at `3097163505b2e9f664dc7103d31c1e9c762756a9`; its own exact CI passed. The #199 feature is not LIVE_VERIFIED until the current deployment SHA and behavior are checked.
- Public shop was last observed empty after demo exclusion. No legitimate reviewed seller offer was available to verify visibility or purchase.
- Disk is critically low (about 42 MiB free of 7.9 GiB); no cleanup was performed. Avoid full builds, dependency installation, Docker pulls and large browser artifacts.
- No payment worktree appeared in `git worktree list`; this does not prove it was deleted. No payment code was changed.

## Recent integration and PR queue

| PR | Status at checkpoint | Next action |
| --- | --- | --- |
| #201 dashboard loading/retry localization | Merged at `2248f57ba8c100e854d4351294bc98d4a83a3e2d`; its post-merge run was cancelled when #196 advanced main. | Confirm the final `main` CI/deployment; dashboard remains PARTIAL pending authenticated responsive/browser inspection. |
| #196 provider team localization | Merged at `c1c8bf530c384e7eef08cbeb2c9c78fcb7eecbda`; synchronized-head PR CI passed. | Confirm main CI/deploy and provider route behavior. |
| #203 account invitation inbox states | Merged at `07c2ac246e344f0eac9e319449801c2e9df88df9`; exact-head PR CI passed. Main CI/deploy `42584955441` is still running; production currently remains at `c1c8bf5…`. | Verify the production SHA and safely test invitation inbox states after deployment. |
| #204 household membership/subscription localization | Open against main and synchronized with #203. The subscription code was tested after sync; subsequent commits only refreshed this handoff, so verify the live GitHub head and its fresh CI before merge. | Await exact-head CI; then merge only if GitHub permits and required checks remain green. |
| #200 public insurance localization | PR description corrected; current head `1d4d1845fcb71721c9f46df65ffa922cdb9780cb`; prior CI passed, but branch is behind main. | Synchronize and rerun checks only after current main release settles. The in-product eligibility/application path remains a known X-04 scope question. |
| #178, #181–#184 | Their latest reported checks passed on old heads, but PRs are behind current main. | Synchronize independently after release queue settles, inspect actual diffs, rerun exact-head checks; do not reuse stale green results. |
| #202 travel test race | Merged at `3097163505b2e9f664dc7103d31c1e9c762756a9`; PR CI green. | Confirm production release SHA and behavior. |

Older stacked PRs remain, including #110→#111, #113→#114, and older shop/booking localization chains. Inspect current bases and conflicts before retargeting; never bypass branch protection.

## Localization work

- PR #203 covers the real `/[locale]/profile` `AccountOverviewView`, not the unused `MemberProfileView`. Household invitation inbox now has fa/en/de/es copy for accessible loading, empty, offline, 401/403 access-denied, generic failure and retry. It preserves the distinction between phone-number match and phone verification and does not grant access before owner approval. Focused tests: 16 passed; targeted ESLint and web typecheck passed. Browser verification remains outstanding.
- PR #204 branch `feat/i18n-subscription-pages` adds German/Spanish translations for `/profile/membership` and `/subscription/plans`, locale-correct dates/counts/currency, offline/access-denied/no-household/empty-plan states, source-language disclosure for plan names/descriptions available only in fa/en, and prevents raw English API messages from appearing in de/es when a localized fallback is supplied. After merging latest main, 71 focused tests passed across member dashboard, account overview and subscription states; the full web suite passed 1,765 tests across 297 files; web typecheck and targeted ESLint passed. Hosted CI on head `5894f7a…` is pending. Responsive authenticated browser inspection remains outstanding.
- The member dashboard `/[locale]/home` already has full application-owned fa/en/de/es body copy and explicit state/date/number formatting with 21 rendering tests; keep de/es PARTIAL until authenticated navigation/refresh and responsive browser checks are performed. Preserve user- and provider-authored content in its source language.
- `docs/product/localization-rollout.md` is the route-family matrix. Many page families and rendered states remain PARTIAL; a translated header is not complete localization. German/Spanish SMS templates/delivery remain unavailable and must not be simulated.
- Keep the landing HERO unchanged. Memorial withdrawal does not prove revocation of independent source image URLs or CDN copies; production bucket/CDN access remains unverified.

## External boundaries and next steps

- Shop remains empty until legitimate, reviewed product and seller-offer data with acceptable content/image provenance exist. Do not re-enable demo records.
- Jajiga is selected, but the small discovery evidence does not prove nationwide coverage or live availability. Digikala access remains unproven; do not bypass source restrictions.
- Poll main CI/deploy `42584955441` for #203; verify production `/api/health/version` and safe invitation states only after it completes.
- Poll the latest PR #204 CI run on the current GitHub head. Once current CI passes, merge through the normal GitHub path if allowed; then verify its release SHA and safe locale behavior.
- Continue route-by-route localization and functional/security work; track remaining page states in the rollout matrix. Do not mark anything LIVE_VERIFIED without merged code, green CI, migration/deploy evidence and observed production behavior.
