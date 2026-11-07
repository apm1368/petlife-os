# PET LIFE OS release and development handoff — 2026-11-07

## Production and release queue

- Current `origin/main`: `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; the previously reported deployment id was `github-42091865674-1`.
- Production `/api/health/version` reports SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`, environment `production`, build time `2026-11-05T22:43:37+03:30`, deployment id `github-42091865674-1`. `/api/health/ready` reports database and Redis up. The HTML `petlife-build` meta still says `dev`; use the API version endpoint as deployment traceability evidence.
- A read-only `GET https://opetlife.ir/api/shop/products?page=1&pageSize=50` returned `total: 15`, with 15 records. Ten are `qa-b4-*`; the other five observed slugs are `soft-sided-travel-carrier`, `calming-grooming-wipes`, `grain-free-training-treats`, `royal-canin-kitten-food`, and `royal-canin-adult-dog-food`. This is evidence the demo/fixture exposure remains live; #107 has not been shown deployed.
- Read-only GitHub REST checks in this session confirm #107 is open at `4ade2952` and #117 is open at `6c8693de`, both based on `main`, with completed successful `build` checks and no submitted reviews. Git reports both heads mergeable, which does not satisfy the missing required review. Neither is merged.
- Read-only REST checks also show #112, #113, #110, #111, #115, #116, #108 and #109 open at `main` (all current `build` checks succeeded; zero approvals). #114 is based on `feat/catalog-accommodation-import` (#113 dependency); #111 is based on `codex/finalize-support`, so both dependencies still need review/merge and retargeting. All are unmerged.
- PR #118 is from `feat/i18n-de-es` to `main`. At code head `d296dddc`, it is open/mergeable with successful CI run #42375658925 (visual/design, lint, typecheck, migrations, tests, API E2E and production build all completed successfully) and no review approval. Localization overlaps `HomeLanding.tsx` with #116/#117 and `ParkHeader.tsx` with #115. It remains not merged/deployed.
- `gh auth status` now succeeds as `apm1368` (HTTPS); current PR status is readable. This credential availability does not authorize bypassing review or required branch protection.

## Memorial image boundary

- #117's last reported implementation publishes a separately copied, opaque memorial asset and makes the memorial endpoint return 404 after withdrawal. Its CI/review status is described above as last reported, not freshly verified.
- The original source image remains in its existing storage namespace because another public-memory feature uses it. Withdrawal of a memorial publication does not revoke the original object URL or previously cached/CDN copies.
- This environment has no authorized production bucket/CDN configuration or credentials. A direct object URL, bucket ACL, CDN cache policy/retention, invalidation behavior, and unrelated object consumers could not be inspected. No source object, bucket permission, or CDN cache was changed. Do not claim complete source-image privacy until those checks are done by an authorized operator.

## Independent development completed in this batch

- Decision reconciliation: `docs/decisions.md` still has historical `GL-06` naming Arabic; open PR #112 records the later owner target of Persian/English/German/Spanish. This branch follows that owner decision without deleting or rewriting `GL-06`; reconcile the log when #112 is approved/merged.
- Local branch `feat/i18n-de-es`, based on `origin/main`; it extends the public landing route and language selector to Persian, English, German and Spanish. Persian remains RTL; the other languages are LTR. Existing approved landing composition is unchanged. German/Spanish use the existing English-labelled hero artwork because the pavilion text is embedded in the image.
- Added German and Spanish copy for the landing story and service pavilions, route-preserving locale links, localized number/date formatting helpers, and tests. The account preference API/database now accepts all four locales, with additive PostgreSQL enum migration; the settings selector can save all four, and its selector/date explanatory copy is localized. Other internal page families remain incomplete; notifications and trip checklist use English fallback for de/es. See `docs/product/localization-rollout.md` for the family-by-family backlog.
- This batch verification completed locally and in CI: API lint/typecheck and web lint/typecheck passed; fresh API E2E passed locally (75 suites, 863 tests) after migrations were applied from zero; full web suite passed locally (229 files, 999 tests); production web build succeeded and generated 724 static pages for fa/en/de/es. The four-locale account persistence assertion and UI tests passed. CI run #42375658925 for pushed code head `d296dddc` also completed successfully across visual/design checks, lint, typecheck, migrations, tests, API E2E and build.
- Account preference implementation: `Locale` adds `de/es` through an additive PostgreSQL enum migration; PATCH/GET `/me` round-trips all four values. Web account language selector saves all four and routes explicitly to the selected locale. Date/number formatting helpers now support Gregorian de/es and Persian Jalali fa. German/Spanish catalogs for most internal pages are still absent; settings page is only partially localized, and notifications/trip checklist copy uses English fallback. No full application translation claim.
- Continued localization slice on `feat/i18n-de-es`: member desktop/mobile navigation, Explore mega-menu/sheet, Explore index and account section navigation now have explicit fa/en/de/es strings, locale-preserving internal routes, and localized navigation labels/accessibility names. No account authorization, household membership, payment or language-persistence contract was changed. German/Spanish translations remain incomplete in account/auth page bodies and all other internal page families.
- Localization slice verification: relevant Vitest files pass (3 files, 23 tests); web typecheck, web lint and `git diff --check` pass. An earlier full web run executed 230 files and reported 229 passing / 1 failing (four assertions in the newly added Explore test incorrectly searched for a travel link inside the Care section); the test was corrected, then all 23 affected tests passed. The full web suite has not yet been rerun after that correction.
- Production remains SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; live public product API still returns 15 items, including 10 `qa-b4-*` records. #107 remains open, build-successful, mergeable but `REVIEW_REQUIRED`; no production release has occurred.
- Current GitHub status: #118's code head `d296dddc` is pushed, CI-successful, mergeable and awaiting review. #115/#116/#117 are likewise open with successful builds but no reviews. #118 overlaps `HomeLanding.tsx` with #116/#117 and `ParkHeader.tsx` with #115; avoid retargeting/rebasing until those owner reviews/merges, then inspect and rerun the resulting diff.

## Preserved work

- Separate payment-controls worktree and its uncommitted payment changes were not touched.
- Separate household/family worktree and audit-workbook worktree were not touched.
- Current worktree is the localization branch; do not reset or clean it.

## Exact next actions

1. Push the reviewed localization navigation slice to #118, then wait for the CI run on its exact new head and obtain the required review. Keep #107 first in the release queue; do not bypass protection.
2. After review/checks permit, merge #107 through the protected path, deploy via the authorized pipeline, and verify deployed SHA plus the live public API; confirm a legitimate reviewed product remains visible before calling it resolved.
3. Have an authorized operator inspect original and memorial object access, bucket/CDN caching and shared image consumers. Correct the disclosure if the source remains public; do not revoke shared access without impact/reversibility review.
4. Push/review the local `feat/i18n-de-es` batch. Continue German/Spanish by page family, including saved preferences, translations, formatting and tests; do not call other page families translated until they are.

## Latest recheck for this handoff

- #118 remains open at `b6a71966ba41b3bd1b328b2d2ec8f7f680db6dea`, base `main`, mergeable, CI `build` succeeded (run `42376716267`), review required. This is the pre-localization-slice remote head; the current working-tree slice still needs its commit/push and CI.
- #107 remains open at `4ade295291f96a8e68b2b4698d6d298b770ed88c`, mergeable, `REVIEW_REQUIRED`, last `build` check succeeded (run `42231686406`). The production API still shows the demo exposure recorded above; no release/merge/deploy was made.
- #115 (`1618a683`), #116 (`1e16a2fd`) and #117 (`6c8693de`) are open and review-required. Their heads have not changed in this recheck. Landing PR overlaps remain; no branch was retargeted.
- Production version endpoint still reports `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. Payment worktrees remain present and untouched: `/workspace/petlife-payment-controls` (`codex/payment-controls`), `/workspace/petlife-payment-controls-live` (`feat/payment-controls`) and `/workspace/petlife-payment-infrastructure` (`feat/payment-infrastructure`).
