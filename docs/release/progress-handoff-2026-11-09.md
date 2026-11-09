# PET LIFE OS progress handoff — 2026-11-09

Point-in-time checkpoint only. Recheck GitHub, CI and production before each merge or release.

## Release state

- `main`: `c1c8bf530c384e7eef08cbeb2c9c78fcb7eecbda` after PRs #201 and #196 merged normally.
- Production last returned `deee3c66ad4e7533ee4751a999f2225ff4aa40fa` from `/api/health/version` (deployment `github-42573202647-1`). It is behind main. Main CI/deploy for #202's merge (`42580748820`, SHA `3097163…`) had CI green and deploy in progress. A newer main run for #196's merge (`42582860438`, SHA `c1c8bf5…`) was pending. Recheck both; do not assume the older deployment represents current main.
- #199's first main deployment failed in unit tests due to a race in `TravelFavoritesView.test.tsx`. #202 fixed the test and merged at `3097163505b2e9f664dc7103d31c1e9c762756a9`; its own exact CI passed. The #199 feature is not LIVE_VERIFIED until the current deployment SHA and behavior are checked.
- Public shop was last observed empty after demo exclusion. No legitimate reviewed seller offer was available to verify visibility or purchase.
- Disk is critically low (about 43 MiB free of 7.9 GiB); no cleanup was performed. Avoid full builds, dependency installation, Docker pulls and large browser artifacts.
- No payment worktree appeared in `git worktree list`; this does not prove it was deleted. No payment code was changed.

## Recent integration and PR queue

| PR | Status at checkpoint | Next action |
| --- | --- | --- |
| #201 dashboard loading/retry localization | Merged at `2248f57ba8c100e854d4351294bc98d4a83a3e2d`; its post-merge run was cancelled when #196 advanced main. | Confirm the final `main` CI/deployment; dashboard remains PARTIAL pending authenticated responsive/browser inspection. |
| #196 provider team localization | Merged at `c1c8bf530c384e7eef08cbeb2c9c78fcb7eecbda`; synchronized-head PR CI passed. | Confirm main CI/deploy and provider route behavior. |
| #203 account invitation inbox states | The branch is synchronized with current main and the handoff add/add conflict is resolved. The latest source-code checks after sync passed locally (16 account tests, ESLint, typecheck and diff-check). | Recheck CI on the latest branch head after the documentation-only handoff update; merge normally only when GitHub permits. |
| #178, #181–#184, #200 | Their branches were updated to the newer main; CI is restarting on updated heads. | Check exact current head/CI/review/merge state before merging; no old-head pass counts. |
| #202 travel test race | Merged at `3097163505b2e9f664dc7103d31c1e9c762756a9`; PR CI green. | Confirm production release SHA and behavior. |

Older stacked PRs remain, including #110→#111, #113→#114, and older shop/booking localization chains. Inspect current bases and conflicts before retargeting; never bypass branch protection.

## Localization work

- PR #203 covers the real `/[locale]/profile` `AccountOverviewView`, not the unused `MemberProfileView`. Household invitation inbox now has fa/en/de/es copy for accessible loading, empty, offline, 401/403 access-denied, generic failure and retry. It preserves the distinction between phone-number match and phone verification and does not grant access before owner approval. Focused tests: 16 passed; targeted ESLint and web typecheck passed. Browser verification remains outstanding.
- Local branch `feat/i18n-subscription-pages`, commit `65568752` plus a merge of current main, adds de/es translations for `/profile/membership` and `/subscription/plans`, locale-correct dates/counts/currency, offline/access-denied/no-household/empty-plan states, source-language disclosure for plan names/descriptions available only in fa/en, and prevents raw English API messages from appearing in de/es when a localized fallback is supplied. Local tests: overview 12, plans 11, catalog parity + API error tests 7 passed; ESLint, TypeScript and `git diff --check` passed. This branch has not yet been pushed/opened as a PR.
- `docs/product/localization-rollout.md` is the route-family matrix. Many page families and rendered states remain PARTIAL; a translated header is not complete localization. German/Spanish SMS templates/delivery remain unavailable and must not be simulated.
- Keep the landing HERO unchanged. Memorial withdrawal does not prove revocation of independent source image URLs or CDN copies; production bucket/CDN access remains unverified.

## External boundaries and next steps

- Shop remains empty until legitimate, reviewed product and seller-offer data with acceptable content/image provenance exist. Do not re-enable demo records.
- Jajiga is selected, but the small discovery evidence does not prove nationwide coverage or live availability. Digikala access remains unproven; do not bypass source restrictions.
- First resolve PR #203's handoff add/add conflict and rerun exact-head CI. Then publish the subscription localization branch as a separate PR based on current main.
- Poll the two main release workflows and verify production `/api/health/version`, readiness, and safe public APIs only after deployment completes.
- Continue route-by-route localization and functional/security work; track remaining page states in the rollout matrix. Do not mark anything LIVE_VERIFIED without merged code, green CI, migration/deploy evidence and observed production behavior.
