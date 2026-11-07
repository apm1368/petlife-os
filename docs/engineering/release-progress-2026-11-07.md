# PET LIFE OS release and development handoff — 2026-11-07

## Production and release queue

- Current `origin/main`: `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; the previously reported deployment id was `github-42091865674-1`.
- Production `/api/health/version` reports SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`, environment `production`, build time `2026-11-05T22:43:37+03:30`, deployment id `github-42091865674-1`. `/api/health/ready` reports database and Redis up. The HTML `petlife-build` meta still says `dev`; use the API version endpoint as deployment traceability evidence.
- A read-only `GET https://opetlife.ir/api/shop/products?page=1&pageSize=50` returned `total: 15`, with 15 records. Ten are `qa-b4-*`; the other five observed slugs are `soft-sided-travel-carrier`, `calming-grooming-wipes`, `grain-free-training-treats`, `royal-canin-kitten-food`, and `royal-canin-adult-dog-food`. This is evidence the demo/fixture exposure remains live; #107 has not been shown deployed.
- Read-only GitHub REST checks in this session confirm #107 is open at `4ade2952` and #117 is open at `6c8693de`, both based on `main`, with completed successful `build` checks and no submitted reviews. Git reports both heads mergeable, which does not satisfy the missing required review. Neither is merged.
- Read-only REST checks also show #112, #113, #110, #111, #115, #116, #108 and #109 open at `main` (all current `build` checks succeeded; zero approvals). #114 is based on `feat/catalog-accommodation-import` (#113 dependency); #111 is based on `codex/finalize-support`, so both dependencies still need review/merge and retargeting. All are unmerged.
- `gh auth status` reports the configured `GH_TOKEN` is invalid. Public read-only REST calls worked, but write operations (PR edits, pushes, merges or deploy triggers) must wait for valid authorized credentials. No write action was attempted.

## Memorial image boundary

- #117's last reported implementation publishes a separately copied, opaque memorial asset and makes the memorial endpoint return 404 after withdrawal. Its CI/review status is described above as last reported, not freshly verified.
- The original source image remains in its existing storage namespace because another public-memory feature uses it. Withdrawal of a memorial publication does not revoke the original object URL or previously cached/CDN copies.
- This environment has no authorized production bucket/CDN configuration or credentials. A direct object URL, bucket ACL, CDN cache policy/retention, invalidation behavior, and unrelated object consumers could not be inspected. No source object, bucket permission, or CDN cache was changed. Do not claim complete source-image privacy until those checks are done by an authorized operator.

## Independent development completed in this batch

- Decision reconciliation: `docs/decisions.md` still has historical `GL-06` naming Arabic; open PR #112 records the later owner target of Persian/English/German/Spanish. This branch follows that owner decision without deleting or rewriting `GL-06`; reconcile the log when #112 is approved/merged.
- Local branch `feat/i18n-de-es`, based on `origin/main`; it extends the public landing route and language selector to Persian, English, German and Spanish. Persian remains RTL; the other languages are LTR. Existing approved landing composition is unchanged. German/Spanish use the existing English-labelled hero artwork because the pavilion text is embedded in the image.
- Added German and Spanish copy for the landing story and service pavilions, route-preserving locale links, localized number/date formatting helpers, and tests. Current application route localization is intentionally partial: non-landing page families still fall back to English, and account locale persistence remains Persian/English. See `docs/product/localization-rollout.md` for the family-by-family backlog.
- Verification: web typecheck and lint passed on the current local head. The full web suite passed immediately before the final member-language selector/path-preservation adjustment (229 files, 993 tests); after that adjustment, the affected landing/navigation/locale suite passed again (31 tests). Full E2E, production build, complete locale coverage and deployment were not run/verified.
- Localization implementation is committed as `f15617e` and pushed to `origin/feat/i18n-de-es`. A PR has not been opened: `gh` has no usable logged-in account (`GH_TOKEN` is invalid and no keyring login is configured), even though the Git remote can push. Do not bypass that authorization gap; PR creation is the remaining handoff action for this slice.

## Preserved work

- Separate payment-controls worktree and its uncommitted payment changes were not touched.
- Separate household/family worktree and audit-workbook worktree were not touched.
- Current worktree is the localization branch; do not reset or clean it.

## Exact next actions

1. Restore valid GitHub CLI authentication, open a PR for `feat/i18n-de-es`, then refresh PR heads, reviews and required checks. Keep #107 first in the release queue; do not bypass protection.
2. After review/checks permit, merge #107 through the protected path, deploy via the authorized pipeline, and verify deployed SHA plus the live public API; confirm a legitimate reviewed product remains visible before calling it resolved.
3. Have an authorized operator inspect original and memorial object access, bucket/CDN caching and shared image consumers. Correct the disclosure if the source remains public; do not revoke shared access without impact/reversibility review.
4. Push/review the local `feat/i18n-de-es` batch. Continue German/Spanish by page family, including saved preferences, translations, formatting and tests; do not call other page families translated until they are.
