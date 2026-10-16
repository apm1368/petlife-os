# Animal-support operations — PR #30

Base fetched from GitHub: `9f2048d8afa4da4b66e1a291b31d0998ac1cc8df` (`stabilization/wave-1`). Implementation and evidence: [PR #30](https://github.com/apm1368/petlife-os/pull/30). This record supersedes earlier environment-specific statements about unavailable GitHub authentication and Prisma downloads; it does not rewrite their historical results.

## Behavior and contracts

- Four new admin routes: rescue list/detail and campaign list/detail, under `/[locale]/admin/animal-support`. Lists use real pagination/status/organization filters, and creation returns a server-issued record link.
- Campaign status, public progress updates/evidence and community sharing use existing APIs. Raised totals come from the ledger response; no prices, donations or progress totals are generated in shipped UI.
- Organization information is readable without write permission; editing/logo uploads, membership and verification decisions require `animalSupport.manage`. Fund reads require `animalSupport.view`; payout/refund controls require the separate `animalSupport.payout` permission. Moderation and exact-location reveal follow their own trust/PII permissions.
- Organization PATCH sends only changed fields; `null` explicitly clears nullable text. A null organization name is rejected by validation. Failed drafts remain available.
- New `POST /admin/animal-support/rescue-cases/:id/evidence` fills a genuine contract gap after the pre-existing upload target. It validates the existing minted-key format and case ownership, appends/deduplicates under a case row lock, and commits its audit entry in the same transaction. No Prisma schema or migration change.
- Payout records an already completed external payment in the ledger, **not a bank transfer**. Organization row locking prevents concurrent payouts spending the same balance. General/restricted funds are never silently combined. A lost/5xx payout response locks further local submission pending finance review.
- Upload registration follows a successful PUT; upload errors cannot claim registration. Image controls have localized labels and keyboard-operable selection. Public evidence is identified as public; private verification downloads remain separate and audited.
- Timestamp dates use the existing Tehran instant formatter, not the day-key parser. A real browser capture caught `NaN`; it was corrected with a Jalali day-boundary regression.

## Verification

- Exact pnpm **10.33.0**, frozen lockfile install: passed; lockfile unchanged.
- Real Prisma Client **5.22.0** generated against the repository schema. A dedicated local PostGIS/Redis test environment applied all **88 existing migrations**. No server database was used for tests.
- Relevant API unit tests: **154 passed** across the full unit suite, including payout ordering/balance protections.
- Initial two relevant API integration suites: **54 passed**. The expanded suite then caught an invalid test evidence filename; the fixture was corrected to obtain a real server-minted upload target. The three new regressions (PATCH semantics, evidence ownership/deduplication, concurrent payout) subsequently passed. No assertion or timeout was weakened.
- A local Node 20 run against dependencies installed under the session's Node 24 exited with native signal 139; it is not reported as a passing test. Fresh Node 20 CI is the integration/release authority. The complete CI at `376c876` passed install, actual Prisma generation, lint, typecheck, tests, all API e2e and production build: [run 38881814494](https://github.com/apm1368/petlife-os/actions/runs/38881814494).
- Local full web run under concurrent compilation: **805 passed / 4 timed out** in three unchanged files (205 files total). All **12 tests in those three files passed unchanged** on rerun. The complete CI web run passed; the local run is not relabeled green.
- Focused final support regressions: **18 passed**, covering access, preserved drafts, real-upload acknowledgement, explicit confirmation, integer IRR, uncertainty locking and Jalali dates.
- Root lint passed with three pre-existing warnings. Final code and committed evidence must retain a green current-head CI before merge; previous-head green alone is insufficient.
- Translation catalogs retain identical fa/en key sets. No new conditional bilingual copy was added.

## Visual evidence

`support-operations-screenshots/checks.json` records six actual pages in fa/en at 390 and 1440 (24 captures), with document overflow and uncaught-page-error checks. Captures use controlled API responses only. They are neither live writes nor proof of every role/entity combination.

| Page | fa 390 | fa 1440 |
|---|---|---|
| Rescue list | [Capture](support-operations-screenshots/rescues-fa-390.webp) | [Capture](support-operations-screenshots/rescues-fa-1440.webp) |
| Rescue detail | [Capture](support-operations-screenshots/rescue-detail-fa-390.webp) | [Capture](support-operations-screenshots/rescue-detail-fa-1440.webp) |
| Campaign list | [Capture](support-operations-screenshots/campaigns-fa-390.webp) | [Capture](support-operations-screenshots/campaigns-fa-1440.webp) |
| Campaign detail | [Capture](support-operations-screenshots/campaign-detail-fa-390.webp) | [Capture](support-operations-screenshots/campaign-detail-fa-1440.webp) |
| Organization | [After](support-operations-screenshots/organization-fa-390.webp) / [Before](support-operations-screenshots/before-organization-fa-390.webp) | [After](support-operations-screenshots/organization-fa-1440.webp) / [Before](support-operations-screenshots/before-organization-fa-1440.webp) |
| Donations | [After](support-operations-screenshots/donations-fa-390.webp) / [Before](support-operations-screenshots/before-donations-fa-390.webp) | [After](support-operations-screenshots/donations-fa-1440.webp) / [Before](support-operations-screenshots/before-donations-fa-1440.webp) |

English counterparts use `-en-` in the same filenames. The four new routes have no invented before screenshot. Before captures use a separate worktree at the fetched base; the historical date-format defect is retained in that evidence.

Reproduce with Next on port 3000 and the browser script `browser-support-operations-review.py`; before uses `REVIEW_ORIGIN=http://127.0.0.1:3002` plus `--before`. These scripts reject mutations. No screenshot fixture is imported by application code.

## Boundaries

This PR does not certify every route/endpoint in PET LIFE OS, perform external transfers, establish official KYC lookup, or claim release before the deploy result and `/api/health/version` match. The updated static inventories and `docs/ops/stabilization-remaining.fa.md` retain unresolved groups. Remaining settings/partner/specialist work must be reviewed against existing controllers before implementing another API.
