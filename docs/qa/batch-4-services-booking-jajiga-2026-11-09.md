# Batch 4 — services, booking and Jajiga checkpoint (2026-11-09 UTC)

## Baseline

- Code under review: `origin/main` `5abddaa84d7b91df9b1eb501264c3a4be886354e`.
- Production `/api/health/version`: same SHA, deployment `github-42670462582-1`; readiness returned HTTP 200 with database and Redis healthy.
- Relevant decisions: B-01..B-09, BK-01..BK-20, PL-03/PL-10, PL-11, DS-01..DS-20, GC-09/GC-10. Jajiga is the selected source; no source comparison was reopened.
- Existing routes and flows already exist for service discovery, customer booking, provider bookings, external accommodation discovery/detail/outbound, and admin sync/review. Customer booking UI and provider console are still marked PARTIAL in `docs/product/localization-rollout.md`; this batch does not claim to complete them.

## Verified production/source evidence

| ID | Environment / route | Procedure | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| B4-PROD-01 | Production, `GET /api/health/version` | Read-only request | Report deployed SHA | `5abddaa84d7b91df9b1eb501264c3a4be886354e`, deployment `github-42670462582-1` | PASS |
| B4-PROD-02 | Production, `GET /api/health/ready` | Read-only request | Healthy readiness | HTTP 200; database and Redis healthy | PASS |
| B4-PROD-03 | Production, `GET /api/services/categories` | Read-only request | Available service taxonomy | VET, GROOMING, TRAINING, WALKING, SITTING, BOARDING, PET_TAXI | PASS (route only; not provider availability) |
| B4-PROD-04 | Production, `GET /api/travel/external/stays?page=1&pageSize=10` | Read-only request | Published, source-attributed stays only | Empty result (`total: 0`); no real accommodation offer available to inspect | PARTIAL |
| B4-SRC-01 | Jajiga public robots and pet-filter search | One robots GET and one public search GET; no login, hidden API, or access-control bypass | Establish whether a small read-only sample is accessible | robots allows `/`; search HTTP 200; page metadata reported 3,346 results, first response held 6 cards, 1 with explicit `is_pet_friendly`; observed fields included numeric room ID, URL, title, city/province, max guest capacity and pet marker. Price and image fields were present but not imported/reused. | PASS (small sample only) |

Pilot disposition: 6 first-page cards discovered; 1 explicit pet-marker candidate; 5 skipped because the current adapter admits only explicitly marked pet-friendly results; 0 imported in this read-only pilot; 0 fetch failures. This is not nationwide coverage. No detail page was fetched in this pilot. No date-specific quote, availability, species-specific pet rules, or content/image reuse permission was established. The adapter therefore continues to discard source images, descriptions, amenities and date-less price observations and keeps such listings partial for review. No daily production sync is enabled by this pilot.

## Defect and implementation

`B4-SEC-01` — Before the fix, `GET /travel/external/stays/:id/out` rejected `HIDDEN` records but did not require `publishState=PUBLISHED` or an active/stale lifecycle state. A known UUID for a draft or rejected stay could therefore bypass public moderation and receive a 302 to the source. The service now redirects only published `ACTIVE`/`STALE` records; a denied request creates no outbound-click record. Exact source URL validation remains in place.

Regression coverage added:

- Unit: published active/stale eligibility query and exact Jajiga URL.
- Unit: draft/rejected result is 404 and does not create a click.
- API E2E: draft and rejected UUID cannot redirect; publishing restores the outbound link; hidden records remain unavailable.

## Test status

- Jajiga adapter unit suite: PASS, 5/5 tests.
- Outbound moderation plus Jajiga adapter unit suites: PASS, 8/8 tests.
- API travel E2E: not run locally because there is no local API environment file or active database container, and only 141 MiB remained on the workspace filesystem at the test check. Hosted PR CI is required for the E2E regression.
- Focused ESLint on the changed service, unit spec and API E2E spec: PASS.
- Focused web regression suites: PASS, 57/57 across 7 files for service overview, customer booking flow/list/detail, provider bookings, and Jajiga external-stay list/card. Required building the existing `@petlife/types` package artifact in the linked worktree; no application source was changed for that setup.
- API TypeScript check: BLOCKED by workspace-package build artifacts missing from this linked worktree (baseline errors include unresolved `@petlife/types`, `@petlife/config` and generated Prisma types; no diagnostic pointed at the changed travel service/test files). The hosted CI typecheck is the authoritative check for the PR.
- Browser screenshots, authenticated booking lifecycle and provider-side role flows: NOT_TESTED. No QA account/browser credentials were available. Do not mark booking/provider UI or visual modes LIVE_VERIFIED.
- No migration was added. No production mutation, booking, charge or sync was performed.

## Remaining gaps

- Real service/provider inventory is absent in the unauthenticated production probe; no customer booking or provider booking state can be verified on production without a controlled QA account and real approved provider data.
- Jajiga’s small public sample exposes only one explicitly pet-marked first-page result; content/image rights, details schema, exact date price and date availability remain unverified. No claim of complete live integration or guaranteed availability.
- Full fa/en/de/es visual verification, mobile/tablet/desktop, dark/light and simplified display remain PARTIAL pending browser evidence.

