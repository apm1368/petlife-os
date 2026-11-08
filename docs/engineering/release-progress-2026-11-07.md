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

## PR and release refresh — 2026-11-08

- PR #138 (`d19624a4`) completed hosted CI successfully, including API E2E and production build. PR #139 (`e276e35f`) also completed hosted CI successfully. Both remain OPEN without review approval, based on #122's `feat/i18n-shop-customer`; neither is merged or live.
- #107 remains OPEN at `4ade2952`, `REVIEW_REQUIRED`, with its build successful. A safe read-only production check still reports 15 public shop products, 10 `qa-b4-*`; exposure is unresolved and is the top release risk. Production SHA remains `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`.
- PR #140 (`feat/i18n-lost-pet-de-es` → #122) covers public browse and sighting pages only, not owner report creation/management. Initial local focused coverage: 8 new locale tests plus the report/list regression tests passed; targeted ESLint/typecheck and four-locale JSON parsing passed.
- CI recheck for PR #140 supersedes that pending note: run `42434205220` failed in the full web test suite, not in lint, design, typecheck or migrations. The failing case was an assertion race in `PublicLostPetLocale.test.tsx`: it queried the empty state synchronously while the list fetch was still pending. The test now waits asynchronously for the empty-state content; all 13 relevant local tests pass again. No application/API behavior was weakened or changed. A follow-up commit is being pushed and a fresh full CI run must pass before #140 is green.
- These localization slices do not change the landing components; the approved landing HERO remains untouched. Memorial image direct-source/CDN revocation remains unverified because authorized bucket/CDN read access is unavailable. Payment worktrees remain untouched; disk free space remains 671 MB and no cleanup or local full production build was performed.

## Release and CI checkpoint — 2026-11-08 UTC

- `origin/main` and production still point to `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`. A safe production version check returned deployment `github-42091865674-1`; `/api/shop/products?page=1&pageSize=50` still returns 15 records, including 10 `qa-b4-*`. No demo-data fix is live.
- PR #107 is open at `fc193a8e25d7bcdea85deef560038233cbdbafe9`, base `main`. Its latest CI run `42435941821` passed migrations, unit tests, API E2E and build. It now also backfills 11 Batch 5 QA places and 3 travel partners by deterministic IDs, marks future QA inserts, and requires a known seed email for legacy provider-name matches. Focused provenance tests: 4 passed; API lint and typecheck passed. Review is still required; no merge or deploy occurred.
- PR #107's migration preserves normal products: known product fixture slugs are unique and explicitly enumerated; its E2E creates a separately reviewed product and verifies that it remains visible. Production visibility of any legitimate reviewed catalog offer still needs post-deploy verification.
- Localization PRs #138 (`d19624a4`), #139 (`e276e35f`), #140 (`27eff385`) and #141 (`54256056`) have successful CI on their reported current heads. All remain unmerged and depend on #122; #122 depends on #118, which is still open with `REVIEW_REQUIRED`. #140's initial asynchronous empty-state assertion failure was corrected; the fresh full CI run then passed. These slices are not live.
- The review queue remains blocked: #107, #112, #113, #115–#118 and #110 have no qualifying approval; #114 depends on #113, #111 on #110, and #119–#121 on #118 or subsequent locale branches. PR #113's description confirms Jajiga is already selected (PL-10). The GitHub collaborators endpoint lists only `apm1368`; a distinct qualified reviewer must be added before protected merges can proceed. No protection was bypassed.
- Disk was 670 MB free before cleanup and 2.6 GB free afterward. Only nine confirmed, inactive `.next` build-output directories were removed; `pnpm store prune` removed 9.2 kB. Source, Git history, worktrees and active Postgres/Redis volumes were preserved; Docker reported no reclaimable image/volume space. The payment-controls worktree remains uncommitted and untouched.
- Memorial source-object and prior CDN-copy privacy remains unverified because authorized bucket/CDN read access is still unavailable. No source image, shared bucket policy or CDN cache was changed.
- Current status: #107 is implemented/tested on its PR branch but awaiting independent review; #138–#141 are CI-green but unmerged; production remains NOT LIVE for these changes. Next required action: add a qualified reviewer, then merge only after approval and green checks; deploy and verify the exact SHA and public product API.


## Release and review checkpoint — 2026-11-08 (rechecked)

### Repository, production, and workspace

- Current `main` is `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`, confirmed from the base SHA currently reported by open PR #107 and the latest successful production deployment workflow run. No PR in the queue is merged.
- Latest recorded production deploy is GitHub Actions run `42091865674`, successful for `main` SHA `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41` on 2026-11-05. This deployment workflow runs CI, creates a database backup before migrations, applies migrations, snapshots the previous build, then runs the production smoke script which checks health/version and public landing endpoints; it restores the prior build if build/health fails.
- Last direct production verification still recorded above is SHA `3ed6c598`, ready health, and 15 public products (10 `qa-b4-*` plus five known seed slugs). This session could not make a fresh HTTP request: the shell execution workspace returned “No usable execution environment”, the Vercel integration lists no `opetlife` project, and the web fetch tool cannot access the API endpoint. Treat the product exposure as NOT LIVE / unresolved until a fresh public API check after deployment.
- Cloud environment status is running/connected with enforced unrestricted network policy but no execution capabilities; shell-backed git, disk, database-volume and test checks are unavailable. This session made no source-code, payment-worktree or database-volume changes. The payment worktree was last observed with uncommitted work preserved; disk last observed at approximately 2.6 GB free; both require a fresh local check when the execution environment returns.
- Production bucket/CDN access remains unavailable. Memorial withdrawal controls the memorial asset route but does not establish revocation of original public source URLs or old CDN copies.

### Current open PR queue

All PRs below are still open and unmerged. Current CI was read from workflow runs attached to the exact PR heads on 2026-11-08: PRs #102–#141 completed successfully; PR #59 has no PR workflow run and GitHub reports it non-mergeable. No review submission is recorded on any open PR (#59, #102–#141). Branch-protection details cannot be read by the GitHub integration (403), so do not infer that mergeability satisfies required review.

- #107 `fc193a8e25` → `main`: CI run `42435941821` success; top release priority; review required; not deployed.
- #112 `d8dd4f88fc` → `main`: CI success; owner decisions/design references; documentation only.
- #113 `c84d8641fd` → `main`: CI success; Jajiga selected by PL-10; no live Digikala importer or production-ready Jajiga sync claimed.
- #114 `c915e1ce82` → #113: CI success; must wait for #113, then retarget to main, inspect diff and rerun API/web/travel/catalog tests.
- #110 `4f3d4eaf52` → `main`: CI success; phone-first registration leaves phone unverified.
- #111 `c8f4e332dd` → #110: CI success; retarget only after #110 and overlapping pet-ownership work are integrated; rerun signup, invitation, household isolation, multi-pet and booking tests.
- #102 `59aaefc1a9` and #106 `ee85dc030f` → `main`: CI success, but both touch pet lifecycle/ownership services; integrate and validate as a combined change before #111.
- #108 `7b71b9a004` → `main`: CI success; Zibal/reconciliation code overlaps the preserved payment-controls worktree; inspect and reconcile that worktree before integration.
- #59 `49cad59cce` → `main`: no workflow run, non-mergeable, no review. Its required FarazSMS sign-in differs from current ON-01 phase scope (unverified phone, no SMS/email verification); do not merge until the product contract and provider configuration are reconciled.
- #115 `1618a6836b`, #116 `1e16a2fd18`, #117 `6c8693de74`, #118 `e57dd03914` → `main`: current CI successful; all still need review. Their overlap is real: #115 touches ParkHeader, #116/#117 touch HomeLanding, and #118 touches HomeLanding, ParkHeader, ParkHero and ParkPavilions. Merge in a reviewed sequence, inspecting the combined diff and preserving the approved HERO image/composition after every step. #117 still does not prove the original storage object/CDN is private.
- Locale foundation chain: #118 → #119 `83fe67c9ec` → #120 `434757a567` → #121 `0345abf47d`. Each exact head CI succeeded; none merged or reviewed.
- #122 `2e1816b790` is based on #118 and CI succeeded. After #118 merges, retarget #122 to main; inspect and rerun shop/currency checks.
- After #122: #123 `d963f84deb` → #124 `d34bb985a1` → #127 `a89201f149`; merge/retest in that order. #132–#141 are direct #122 children and can be retargeted independently after #122; their current exact-head CI runs succeeded.
- #125 `b20026d407`, #126 `b47c9e65d1`, #128 `eb1dc3a8b6`, #129 `94ffaba72b`, #130 `62cca0669c`, #131 `4515b77959` are direct #118 children; after #118 merges, retarget to main and validate independently.
- Other main-based PRs #103 `bb9bdb6102`, #104 `6274af904c`, #105 `2bee685c34`, #109 `bff3b3c173` have successful exact-head CI but no review. Integrate by domain after review; recheck overlaps with #107, #110–#117 and financial/admin code.

### Review queue and release steps

1. Obtain an independent qualified reviewer; all authorship/review records currently show no submitted approval. Never bypass protection.
2. Review #107's migration `apps/api/prisma/migrations/20261105120000_public_demo_record_provenance/migration.sql`: it adds provenance booleans and backfills exact seed product slugs, exact QA IDs, seeded provider names only when paired with known seed-user emails, and exact seeded subscription price sets. E2E checks that demo records disappear while a separately reviewed product remains visible. Confirm backup/rollback readiness, then merge through the protected path.
3. The existing main deploy workflow runs CI and `deploy.sh`; deploy makes a PostgreSQL dump before migration and retains recent deploy backups, runs Prisma migration deploy, snapshots the previous build and invokes `scripts/smoke-production.sh`. Confirm the deploy workflow's exact SHA and successful smoke outcome.
4. After release, safely GET `/api/health/version`, `/api/health/ready`, and `/api/shop/products?page=1&pageSize=50`. Confirm the reported QA fixtures are absent, and independently confirm legitimate reviewed offers remain visible; do not call the fix LIVE_VERIFIED until the deployed SHA and API behavior are observed.
5. Continue the dependency order above. After each base merges, retarget its child, inspect the entire resulting diff, rerun relevant tests and wait for checks on the new head.

### Session actions

- Rechecked open PR list (#59 and #102–#141), current bases/heads, latest exact-head CI runs and review submissions.
- Read-only production access was attempted but not available through this execution session; no new production verification is claimed.
- PR descriptions were updated body-only to correct stale “CI pending/running” wording, record exact successful workflow run/head and state dependencies for #59, #107, #110–#113, #115–#116, #122–#134 and #138–#141. These metadata edits did not change those PR heads.
- Next local action: restore an executor workspace, recheck preserved payment worktree/DB containers and disk, then continue implementation and testing. Next owner/reviewer action: add an independent qualified reviewer, starting with #107.
