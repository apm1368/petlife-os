# Public SEO hardening — 2026-11-11 UTC

Requirement: GC-19 and the 2026-11-11 owner hardening request. Baseline production and `main` were verified at `750efc6d7494a8e7de3e2efa55eda476f59ed742` (`github-42877051162-1`); DB/Redis readiness returned `200`.

## Reproduced production gaps

- `/sitemap.xml`, `/sitemap_index.xml` and `/sitemap-0.xml` returned `404`.
- The sampled `/de/help` and `/es/services` pages returned generic `opetlife` title and English description. Sampled fa/de landing and `/en/shop` also had no canonical/hreflang elements.
- On sampled public HTML, HSTS was present; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and CSP were not observed. The API health response is a separate deployment boundary.
- The current shop API returns no products. It must not be promoted in search or repopulated with demo records to improve SEO.

## Implemented locally on `fix/public-seo-metadata` (based on exact main SHA above)

- Added a static Next sitemap for stable public route roots only, with fa/en/de/es variants, reciprocal `hreflang` and `x-default`. It omits private/tokenized paths, dynamic user records, and known empty/unpublished shop/help/legal/blog/insurance sections.
- Added localized route-specific titles/descriptions and production-origin canonicals/hreflang for the landing, services, travel, community, lost pets, animal support, contact, credits and status routes. Pages with currently empty/unpublished content receive localized metadata but `noindex` and are not in the sitemap.
- Public route group is `noindex` by default. Private account/admin/provider/seller layouts already declare noindex; auth/recovery now does too. Robots disallows those routes and share-token surfaces and advertises the sitemap.
- No landing markup, image or composition changed. No database migration, structured review/rating/price claim or user-content translation was introduced.
- Added unit coverage for canonical origin, reciprocal locale metadata, sitemap inclusion/exclusion and robots policy.

## Verification and blocker

- `git diff --check`: PASS.
- Local Vitest did not start. `pnpm --filter @petlife/web exec vitest ...` triggered a workspace install/relink and stopped with `ENOSPC` at 0 bytes free before tests ran. The subsequent direct TypeScript check used the stale shared dependency tree (Next/Vitest modules unresolved), so it is **BLOCKED**, not a code-test failure or pass.
- Initial disk: 126 MiB free; after failed dependency synchronization: 0 bytes. Inspected project artifacts had no `.next` or `node_modules/.cache` to reclaim. Only this task's temporary `/tmp/petlife-current-report` and the unused Node compile cache were removed; overlay free space did not increase. Shared pnpm store, Git history, database volumes, other worktrees and unrelated `/tmp` evidence were preserved.
- Fresh CI on this PR and exact-head build/typecheck/tests are required before merge. Production sitemap, metadata, canonical/hreflang and noindex behavior remain **NOT LIVE** until deploy and safe GET verification.

Separate security-header PR: #246 was updated through GitHub's normal update-branch endpoint; new head `18dc22a69c9a0778d94928775dcf8e478124173d`, CI run `42959507238` was still running at this checkpoint. It is not merged or deployed. Its diff only adds non-sniffing, same-origin framing and referrer headers (no restrictive script/default/image/connect CSP); exact-head CI must complete before merge.

## Post-merge verification required

Verify exact deployed SHA, readiness, `/robots.txt`, `/sitemap.xml`, and rendered metadata on all listed locale routes. Confirm private/account/tokenized URLs remain noindex/disallowed and are absent from the sitemap; confirm empty/unpublished pages remain excluded. Capture only public, non-personal pages. If external Search Console/domain-owner access is unavailable, report index coverage as unverified.
