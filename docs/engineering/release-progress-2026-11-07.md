# PET LIFE OS release and development handoff — 2026-11-07

## Current continuation update — seller localization follow-up (2026-11-08 00:01 UTC)

- Current seller localization PR #135 head is `48593d2319aefc570935d51f0848f1ba9e3c39a6`, based on `feat/i18n-shop-customer` (#122). This update adds German and Spanish strings for seller offer management and expands the parity test to require the offers keys and interpolation placeholders. Focused validation passed: 4 files / 12 tests, web typecheck, web lint, locale JSON parsing and `git diff --check`.
- Hosted run `42426891935` completed successfully on this exact head; the full build job, including design-system checks, typecheck, migrations, tests, API E2E and production build, passed. PR #135 still has no approval and is not merged.
- PR #135 remains open and unmerged; it depends on #122. No review is recorded. Seller offers are now translated in de/es; nested inventory-history/channel-configuration action copy, seller verification/onboarding and some commerce-backoffice surfaces remain untranslated or fall back to English. German/Spanish SMS templates are not implemented.
- Production was rechecked: `/api/health/version` reports `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; the public products endpoint still returns 15 records, including 10 `qa-b4-*` products and five known seed fixtures. #107 remains open with `REVIEW_REQUIRED`; the demo-data fix is NOT LIVE.
- Disk has 671M available (98% used). No cleanup was performed. The payment worktree remains preserved with four modified payment files and two untracked payment-control files; it was not edited.

## Continuation checkpoint — 2026-11-07 23:38 UTC

- Re-fetched `origin/main`: `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. The primary worktree had no pre-existing uncommitted changes before this seller follow-up. Payment worktree `/workspace/petlife-payment-controls-live` still has four modified payment service/module files and two untracked payment-control service/spec files. It was inspected only and left untouched.
- Disk: 32G total, 30G used, 672M available (98%). Project `node_modules` is 865M and `.git` is 180M. No cleanup was performed; local full production builds are deferred.
- #107 remains OPEN at `4ade295291f96a8e68b2b4698d6d298b770ed88c`; hosted build check is `SUCCESS`, review is `REVIEW_REQUIRED`, and it is not eligible to merge. A fresh public GET of `/api/shop/products?page=1&pageSize=50` returned 15 products: 10 `qa-b4-*` products whose titles explicitly say they are demonstrations, plus five additional slugs matching exact seed fixtures marked in #107's migration. All exposed records match known seed/demo fixtures; no legitimate reviewed product was observed. The #107 fix is therefore NOT LIVE. No deployment was attempted.
- Public `GET /api/health` returns 404; this is not the documented readiness route. Use `/api/health/version` and `/api/health/ready` for release verification.
- PRs #112–#135 remain open/unmerged. The latest exposed `build` checks for #112–#135 are successful; #107 and #112–#118 still show review-required where applicable. #110 awaits review and #111 remains on its non-main dependency base; #113 awaits review and #114 remains based on #113. No branch protection was bypassed.
- Continuing #135: German/Spanish seller inventory, channels/listing reconciliation, team and settings translations; seller settings now presents an accessible error when its update fails; the shared seller/admin promotion manager now renders in all four locales with locale-aware date/count/currency display. For commit `4702994`, hosted CI run `42424996884` passed all steps. Promotion-manager follow-up is local and not yet pushed; latest local focused run: 3 files / 9 tests pass; web typecheck/lint, JSON parsing and `git diff --check` pass. An earlier full web run overlapped live edits and ended with 235 files passed and 2 files/3 assertions failing because the runner loaded an intermediate catalog/test state; final focused tests pass, but the full suite has not been rerun. Seller onboarding and backoffice translation remain incomplete. This work is not live.
- Memorial image boundary unchanged: production bucket/CDN configuration is inaccessible. Withdrawal is not verified to revoke original public URLs or prior CDN copies.

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
- Continued localization slice on `feat/i18n-de-es`: member desktop/mobile navigation, Explore mega-menu/sheet, Explore index, account section navigation and authentication surfaces now have explicit fa/en/de/es strings and locale-preserving internal routes. No account authorization, household membership, payment or language-persistence contract was changed. Account settings and household page bodies and other internal page families remain incomplete.
- Continued auth slice: German/Spanish localized messages now cover registration, password login, phone/OTP login, password recovery/reset and the auth shell. The DE/ES auth message branches are deeply merged over English fallback so untranslated namespaces still render instead of throwing missing-key errors. This does not implement or simulate provider SMS templates.
- Localization slice verification: relevant Vitest files pass (8 files, 43 tests), including a DE/ES auth-key and interpolation-placeholder parity test; web typecheck, web lint and `git diff --check` pass. Production web build passed with `NEXT_PUBLIC_API_ORIGIN=http://localhost:4000` and generated 724 locale route variants/pages. An earlier full web run executed 230 files and reported 229 passing / 1 failing (four assertions in the newly added Explore test incorrectly searched for a travel link inside the Care section); the assertion was corrected and the affected test now passes. The full web suite has not yet been rerun after the latest auth changes.
- Production remains SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; live public product API still returns 15 items, including 10 `qa-b4-*` records. #107 remains open, build-successful, mergeable but `REVIEW_REQUIRED`; no production release has occurred.
- Current GitHub status: #118 head `49316af` is pushed and mergeable, review required; CI run `42387689186` succeeded end-to-end in 10m23s. #115/#116/#117 are likewise open with successful builds but no reviews. #118 overlaps `HomeLanding.tsx` with #116/#117 and `ParkHeader.tsx` with #115; avoid retargeting/rebasing until those owner reviews/merges, then inspect and rerun the resulting diff.

## Preserved work

- Separate payment-controls worktree and its uncommitted payment changes were not touched.
- Separate household/family worktree and audit-workbook worktree were not touched.
- Current worktree is the localization branch; do not reset or clean it.

## Live recheck and localization shop slice — 2026-11-07 18:10 UTC

- Fresh `git fetch origin` confirms `origin/main` remains `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; production `/api/health/version` returned the same SHA, `production`, and deployment `github-42091865674-1`.
- Fresh safe GET `https://opetlife.ir/api/shop/products?page=1&pageSize=50`: 15 products total; 10 `qa-b4-*` demo records and five other slugs. #107 remains open at `4ade295291f96a8e68b2b4698d6d298b770ed88c`, `REVIEW_REQUIRED`; its build check passed (run `42231686406`). No merge or deploy was attempted. This is the highest-priority release blocker.
- Localization queue recheck: #118 `e57dd039` → `main`, CI passed, review required; #119 `83fe67c` → #118, CI passed; #120 `434757a` → #119, CI passed; #121 `0345abf` → #120, latest API E2E/build check passed (run `42397981911`). No localization PR is merged. Retarget only after the preceding base is approved, green and merged, then inspect and test the changed diff.
- Opened #122 (`feat/i18n-shop-customer`, head `962589871c46ad44ba306223fe3687a0a5332b33`) directly against #118 to keep the seller/account PR chain out of the customer shop work. It adds DE/ES shop home, product discovery, product detail, compatibility, cart and commerce labels plus locale-aware Toman, number and review-date display. CI run `42399845774` was still in progress at this checkpoint: lint, design-system checks, typecheck and migrations succeeded; web tests were running; API E2E and production build were pending. Local focused tests passed (7 files / 44 tests), web typecheck and lint passed, and `git diff --check` passed. Local full production build was not run due disk headroom.
- Explicit fallback remaining: checkout, orders, repeat delivery, favorites, seller catalog/onboarding/finance, booking, support/legal, travel, community, backoffice and notifications. DE/ES SMS templates/delivery are not implemented. Persian remains RTL with Jalali date behavior; no locale-driven language save/API behavior changed in #122.
- Disk: initial `df` showed 49 MiB available. Removing the confirmed generated project `.next` build raised it to about 1.6 GiB. The three inspected old temporary Node/Jest/Next build-output directories were also removed; the latest exact `df -B1` shows 1,443,729,408 bytes available (96% used). `/tmp` is now 35 MiB. Only those named regenerable artifacts were removed; source, `.git`, production data, DB volumes and worktrees were not cleaned. Payment-controls worktree still contains the same uncommitted service/module/spec changes and was not modified.
- #117 memorial source-image/direct storage URL and CDN privacy remains unverified without authorized production bucket/CDN access. #110→#111 and #113→#114 dependencies remain open and unchanged. No branch protection was bypassed; all features remain NOT LIVE unless separately production-verified.

## Exact next actions

1. Wait for CI on the latest #118 head and obtain the required review. Keep #107 first in the release queue; do not bypass protection.
2. After review/checks permit, merge #107 through the protected path, deploy via the authorized pipeline, and verify deployed SHA plus the live public API; confirm a legitimate reviewed product remains visible before calling it resolved.
3. Have an authorized operator inspect original and memorial object access, bucket/CDN caching and shared image consumers. Correct the disclosure if the source remains public; do not revoke shared access without impact/reversibility review.
4. Push/review the local `feat/i18n-de-es` batch. Continue German/Spanish by page family, including saved preferences, translations, formatting and tests; do not call other page families translated until they are.

## Latest recheck for this handoff

- #118 is open at `49316af9bfdfc62acf949b741d2e38e1715cb698`, base `main`, mergeable, review required. CI run `42387689186` succeeded (lint, design-system/visual, typecheck, migrations, tests, API E2E and build). No qualifying review has been submitted.
- #107 remains open at `4ade295291f96a8e68b2b4698d6d298b770ed88c`, mergeable, `REVIEW_REQUIRED`, last `build` check succeeded (run `42231686406`). The production API still shows the demo exposure recorded above; no release/merge/deploy was made.
- #115 (`1618a683`), #116 (`1e16a2fd`) and #117 (`6c8693de`) are open and review-required. Their heads have not changed in this recheck. Landing PR overlaps remain; no branch was retargeted.
- Production version endpoint still reports `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. Payment worktrees remain present and untouched: `/workspace/petlife-payment-controls` (`codex/payment-controls`), `/workspace/petlife-payment-controls-live` (`feat/payment-controls`) and `/workspace/petlife-payment-infrastructure` (`feat/payment-infrastructure`).

## Localization continuation — 2026-11-07

- Rechecked GitHub: #118 is open at `49316af9bfdfc62acf949b741d2e38e1715cb698`, base `main`, `REVIEW_REQUIRED`; CI `42387689186` passed all jobs. #107 is still open at `4ade295291f96a8e68b2b4698d6d298b770ed88c`, `REVIEW_REQUIRED`, build passed. #115/#116/#117 are open, review-required and their latest builds pass. No merge or deploy was performed.
- Production remains SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. The live version endpoint was checked again. A guessed `/api/catalog/products` path returned 404 and was not used as evidence about product data; the earlier verified `/api/shop/products` result remains the latest product evidence (15 total, 10 QA/demo).
- Continued #118 with DE/ES household collaboration copy: member management, invitations, pet access presets, confirmation actions, access history and delivery-unavailable copy. Account dates now use `Intl.DateTimeFormat` for selected en/de/es locale while Persian remains Jalali; account numbers use locale digits/grouping.
- Validation: all account tests passed (9 files, 29 tests); the full web suite passed (233 files, 1,021 tests); web typecheck and lint passed; the production web build passed and generated all 724 localized route variants. `git diff --check` passed. Commit `10394b3` is pushed, and CI run `42389734102` passed all required jobs in 11m7s.
- Separate payment worktrees remain untouched. #117's source-image/CDN privacy boundary remains unverified because no authorized production storage configuration is available.

## Checkout/order/favorites/seller localization recheck — 2026-11-07 22:34 UTC

- Production and `origin/main` remain at `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41` (`github-42091865674-1`). The public product API again returned 15 results, including 10 `qa-b4-*` demo records. #107 is still `REVIEW_REQUIRED`; no merge/deploy was attempted, and the live demo-data defect remains.
- #132 (checkout) is based on #122 at `01c3aa2a1f8054689a8208d04f84b76bc6752dd7`; run `42417793232` passed, review absent. #133 (customer orders/details) is based on #122 at `77c9250cebacc7b2eaaa9d92684a058b32715cb0`; run `42418431721` passed, review absent. #134 (repeat delivery/favorites) is based on #122; all code checks including API E2E and production build passed in run `42419655721` on `162157276fb21c73fa8e45369096c9665b08f1c1`. The handoff-only commit `9b7949f2708c0b0080b008a9293f9d7220bb6c02` started run `42420743583`, which was still in progress at this checkpoint. No recorded reviews; all are unmerged and NOT LIVE.
- #135 (`feat/i18n-seller-operations`) now also includes the seller finance summary, transaction list and settlement list/detail, localizing financial labels/statuses without changing ledger, permissions, order transitions, payouts or balances. Local validation on the expanded scope: 35 focused seller tests passed; 2 DE/ES seller catalog parity tests and 4 locale date tests passed; web typecheck, lint, JSON and diff checks passed. Persian RTL/Jalali behavior is retained. The current local changes have not yet been pushed; their push will create a new hosted run that must be checked on that exact final head. No review is recorded.
- Remaining seller German/Spanish gaps: offer/catalog workflows (#123 is separate), inventory, channels, promotions, team, settings, finance and backoffice. Booking/provider, support/legal, travel/community and notifications are still partial/untranslated as tracked in `docs/product/localization-rollout.md`; SMS templates/delivery are not implemented or simulated. Fallback English is not counted as complete translation.
- Disk is still 673 MiB free (98% used); only about 8 MiB of confirmed `.turbo/cache` was removed from the earlier 667 MiB state. No source, Git history, payment worktree, user/production data, database volumes or unknown artifacts were deleted. Avoid local production builds until disk headroom is restored; hosted CI remains the build gate.
- Payment-controls worktree `/workspace/petlife-payment-controls-live` remains untouched with the same pre-existing uncommitted files. No translation feature is merged or deployed. Memorial original-source/bucket/CDN privacy remains unverified.

## Latest localization CI checkpoint — 2026-11-07 22:39 UTC

- #134's latest docs-inclusive head `9b7949f2708c0b0080b008a9293f9d7220bb6c02` has now passed hosted run `42420743583`; this supersedes the earlier pending status above. It remains open, unreviewed, based on #122 and NOT LIVE.
- #135's previous code head `fc3d61d32111853a71b4c239f8a7e4e7bb9f5a14` was being checked in run `42421492102`, but that run is superseded by the new finance-localization work. The next push advances the head and supersedes this status; report green only after the new latest-head run finishes.
- The expanded #135 work adds Persian seller fulfillment labels and seller finance translations/tests while keeping fa/en/de/es catalog coverage intact. Its latest local validation is 35 seller tests, 2 seller key/interpolation parity tests, 4 locale date tests, and passing typecheck/lint. The existing finance ledger/payout behavior is unchanged.
- Disk check remains `673 MiB` free (98% used); production build remains deferred locally. Payment worktree and its pre-existing uncommitted changes remain preserved. `origin/main`/production SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`; #107 still requires review and production still exposes 10 demo records out of 15.

## Final localization/release check — 2026-11-07 22:57 UTC

- Fresh `git fetch origin`: `origin/main` remains `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. Production `/api/health/version` returns the same SHA and deployment `github-42091865674-1`. Safe public GET of `/api/shop/products?page=1&pageSize=50` still returns 15 items, 10 with `qa-b4-*` slugs. #107 remains open, head `4ade295291f96a8e68b2b4698d6d298b770ed88c`, base `main`, CI run `42231686406` passed, review required/merge blocked. Do not claim the live demo exposure is resolved.
- Current localization/landing PR state (all open, unmerged; head hashes abbreviated to first 7 characters):

| PR | Base | Head | Latest CI | Review |
| --- | --- | --- | --- | --- |
| #115 | `main` | `1618a68` | pass `42274224922` | required |
| #116 | `main` | `1e16a2f` | pass `42273854807` | required |
| #117 | `main` | `6c8693d` | pass `42349510739` | required |
| #118 | `main` | `e57dd03` | pass `42390739809` | required |
| #119 | `feat/i18n-de-es` | `83fe67c` | pass `42396271324` | no review recorded |
| #120 | `feat/i18n-account-settings` | `434757a` | pass `42397371104` | no review recorded |
| #121 | `feat/i18n-pet-profile` | `0345abf` | pass `42397981911` | no review recorded |
| #122 | `feat/i18n-de-es` | `2e1816b` | pass `42400163736` | no review recorded |
| #123 | `feat/i18n-shop-customer` | `d963f84` | pass `42400557006` | no review recorded |
| #124 | `feat/i18n-seller-catalog` | `d34bb98` | pass `42401121091` | no review recorded |
| #125 | `feat/i18n-de-es` | `b20026d` | pass `42402066951` | no review recorded |
| #126 | `feat/i18n-de-es` | `b47c9e6` | pass `42402629254` | no review recorded |
| #127 | `feat/i18n-customer-bookings` | `a89201f` | pass `42403758722` | no review recorded |
| #128 | `feat/i18n-de-es` | `eb1dc3a` | pass `42406445315` | no review recorded |
| #129 | `feat/i18n-de-es` | `94ffaba` | pass `42407730664` | no review recorded |
| #130 | `feat/i18n-de-es` | `62cca06` | pass `42413171313` | no review recorded |
| #131 | `feat/i18n-de-es` | `4515b77` | pass `42415997431` | no review recorded |
| #132 | `feat/i18n-shop-customer` | `01c3aa2` | pass `42417793232` | no review recorded |
| #133 | `feat/i18n-shop-customer` | `77c9250` | pass `42418431721` | no review recorded |
| #134 | `feat/i18n-shop-customer` | `9b7949f` | pass `42420743583` | no review recorded |
| #135 | `feat/i18n-shop-customer` | `79853f1` | pass `42422190037` | no review recorded |

- #135's final code head adds seller shell/dashboard/order/finance localization in de/es, Persian fulfillment regression coverage, and locale-aware date/count formatting; it changes no ledger, payout, payment or seller authorization behavior. Local validation on that code: 35 focused tests (25 seller view tests, 2 seller key/interpolation parity tests, 4 date tests, 4 number tests), web typecheck/lint, JSON and diff checks passed. Hosted run `42422190037` passed all checks in 9m47s. The handoff and rollout documents were updated in this commit; that documentation-only follow-up will trigger a new run, which must be checked before describing the PR's latest *documentation head* CI as green.
- Already-shipped slices still await their required base reviews: #118 is required before #119/#122 chains can be retargeted; #122 is the base for #132–#135. Booking/customer support/notifications/travel localization exists in #124–#131 but is not in production. No branch bases were retargeted and no PR was merged.
- Disk at this check: `672 MiB` free, 98% used. Largest measured project items: root `node_modules` 865 MiB, root `.git` 180 MiB, project worktree 438 MiB; largest sibling worktrees measured included `petlife-catalog-import` 1.4 GiB and `petlife-booking-service-patterns` 860 MiB. Only `.turbo/cache` was previously removed as confirmed regenerable (~8 MiB); source, history, DB volumes, user data, and uncertain worktrees were preserved. Local production build remains deferred due low headroom; hosted production build passed on #135 code head.
- The payment-controls worktree `/workspace/petlife-payment-controls-live` remains unchanged with its pre-existing modified payment services/module and untracked controls service/spec. No translation changes are LIVE. Memorial original-object/CDN privacy remains unverified because authorized bucket/CDN access is unavailable.
