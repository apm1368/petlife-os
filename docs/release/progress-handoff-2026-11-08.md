# PET LIFE OS release handoff — 2026-11-08

This is a point-in-time continuation note, not a claim that the product is complete.

## Release state at handoff

- `main`: `cf5b058c7ffd8b05728fa754b6bf4f87b01aeb7b` (PR #144, household invitation race fix).
- Last production SHA verified before this release: `17655128689b3468b62d26b3cf32b5905f1585ff`.
- Deploy workflow `42473856471` for `cf5b058…`: CI passed (lint, visual tests, typecheck, migrations, unit tests, API E2E and build); SSH deploy was still running at the last check. Recheck `/api/health/version` before assuming it is live.
- #107 demo-product exclusion and #142 production-environment detection are merged. The public shop API currently returns zero products/offers; no reviewed seller offer has been verified live. Do not re-enable QA/demo products to fill the catalog.
- PRs #110–#117, #142, #143 and #144 are merged. #143's public media metadata reduction is in `main`, but was not in the last verified production SHA above.

## Open release candidates

| PR | Head | Base | Latest check known here | Next action |
| --- | --- | --- | --- | --- |
| #145 — exclude demo editorial content | `fa837dff6f193d5f3dffcf7f774c77f43a71a841` | `main` at `cf5b058…` | CI `42473915500` passed | Merge normally after confirming current main/deploy state; deploy and verify blog list/detail no longer expose seeded content. |
| #118 — landing/account/household German and Spanish | `4d7f4d136ad8a0ba7f26c0da3bfbf3be47bda6fb` | `main` at `cf5b058…` | CI `42473934264` passed | Merge normally; preserve landing HERO; verify locale preference and route switching. Coverage remains partial. |
| #102 — audited pet lifecycle corrections | `568d8e707f1bd2526b3c14f7799407241fa01633` | `main` at `cf5b058…` | CI `42473945196` passed | Merge normally after higher-priority release checks; migration and lifecycle state behavior need post-deploy smoke. |

Localization PRs #119–#141 remain open and stacked on the #118/#122 chain. Retarget each dependent PR only after its base merges, inspect the diff, and rerun checks on the new head. PR #129 was reported `DIRTY` at the last queue review. English fallback remains in many internal pages; German/Spanish SMS templates and delivery are not implemented.

## Verified behavior and limitations

- `https://opetlife.ir/api/health/version` last reported production SHA `176551286…`; readiness reported DB and Redis up.
- Public shop endpoint with `page=1&pageSize=50` returned HTTP 200 and `total: 0`.
- Public Jajiga discovery returned HTTP 200 with `total: 0`; earlier pilot found six candidates but imported none. No nationwide coverage, date-specific price/availability, or image-use rights are verified.
- Digikala's previous pilot found no products and observed restrictions on tested product paths. Do not bypass access controls or claim a live importer.
- The old deployed blog API exposed demo editorial content/byline. #143 reduces public media metadata; #145 adds article provenance and production filtering. Recheck both after deployment.
- Memorial withdrawal stops the memorial asset route, but does not prove revocation of independently public source image URLs or CDN copies. Production bucket/CDN access is still unavailable.
- The separate payment worktree was not present in this workspace. No payment files were modified; all discovered worktrees were clean at the last status check.

## Checks and resources

- PR #144's exact head passed full hosted CI, including the concurrent invitation request/approval E2E. Its deploy is the current release to verify.
- PR #145's prior full CI passed on the current head after replacing a brittle fixed article-count assertion with a baseline-relative check. Local E2E could not be run: the local MinIO image pull was unauthorized and the PostGIS image exhausted available disk. Hosted CI is the E2E source of truth.
- API lint and typecheck passed locally for #144 with the repository's pinned pnpm and generated Prisma client.
- Last disk check: about 2.6 GB free. Newly pulled Docker images from failed local E2E attempts were removed; no active containers existed. The empty PostgreSQL volume created during those attempts was preserved.

## Next sequence

1. Verify deployment `42473856471`: production SHA `cf5b058…`, readiness, migration success, and safe invitation API behavior.
2. Merge #145 through the normal GitHub path; wait for the production pipeline and verify the blog's public list/detail no longer expose demo articles or bylines.
3. Merge #118 and #102 only after confirming their current heads/checks remain green; verify each deployed SHA and affected behavior.
4. Continue the localization chain one dependency at a time, then continue the remaining pet/health, shop, travel, support and backoffice work.
5. Keep the shop explicitly empty until a real reviewed product and seller offer with acceptable content/image provenance exist.
