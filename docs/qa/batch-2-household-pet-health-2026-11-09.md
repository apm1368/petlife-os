# Batch 2 — household, pet context and health QA

This record covers the client-side privacy and state-handling fixes made after reviewing the existing household, pet and health flows. It does not certify every Batch 2 feature as complete.

## Baseline and scope

- Checked 2026-11-09 (UTC), repository `apm1368/petlife-os`.
- `main` at inspection: `8e9c71fccfb15b648d60eeea7313b56c32f3ce4` (PR #216). This batch branch was synchronized with that main revision before verification.
- Production at last read: `bab83701ccdc4d4c23d2ee69723be4fc8a5b2aa9`, deployment `github-42647228315-1`; `/api/health/ready` returned HTTP 200 with database and Redis up. Main's #216 CI/deploy run `42652686244` was still in progress, so production was correctly behind main at that observation.
- No database migration or API contract change in this batch.
- Existing local worktrees, including payment-related code if present elsewhere, were not modified. The visible payment worktree was not found; this does not prove it was deleted.
- Local disk had about 466 MiB free. Docker was stopped and no PostgreSQL image was available. `pnpm test:e2e:fresh` was not run because fetching/building its DB environment could exhaust the workspace. Hosted CI E2E remains required.

## Implemented behavior

- Pet-scoped content now remounts on pet-ID changes, clearing prior pet data while the newly selected pet is loading.
- Household detail now clears stale members/pets/access/history while another household is loading; stale requests cannot replace the currently selected household's result.
- Health overview now reports failed optional detail sources instead of silently presenting failed requests as empty medical information. Retry clears the partial-unavailable state when those requests recover.
- Health requests are sequence-guarded, and a summary for a prior pet is not rendered under the next pet's route.
- Added fa/en/de/es copy for the partial-health-details alert, unavailable row state and retry action. Existing Persian RTL/Jalali and non-Persian LTR behavior are retained.

## Automated results

| Test ID | Requirement | Environment / command | Result |
| --- | --- | --- | --- |
| B2-WEB-01 | Household, invitation, multi-pet, profile, pet-context, health, document, timeline and care-calendar regression | Local Vitest: `pnpm --filter @petlife/web exec vitest run features/account/HouseholdCenterView.test.tsx features/account/HouseholdInvitationView.test.tsx features/pets/MyPetsView.test.tsx features/pets/PetProfileView.test.tsx features/pets/PetContextShell.test.tsx features/health/HealthOverviewView.test.tsx features/health-advanced/HealthDocumentsView.test.tsx features/health-advanced/HealthDocumentDetailView.test.tsx features/health-advanced/HealthTimelineView.test.tsx features/care-calendar/PetCareCalendarView.test.tsx` | **PASS** — 10 files, 93 tests, including new stale-household/pet and partial-health failure/retry cases. |
| B2-WEB-02 | Web TypeScript validity | `pnpm --filter @petlife/web exec tsc --noEmit` | **PASS** |
| B2-WEB-03 | Focused lint on changed React components/tests | `pnpm --filter @petlife/web exec eslint features/account/HouseholdCenterView.tsx features/account/HouseholdCenterView.test.tsx features/health/HealthOverviewView.tsx features/health/HealthOverviewView.test.tsx features/pets/PetContextShell.tsx features/pets/PetContextShell.test.tsx` | **PASS** |
| B2-PROD-01 | Production service readiness | Read-only `GET /api/health/ready` | **PASS at recorded production SHA** — HTTP 200, DB and Redis `up`; does not verify authenticated flows. |
| B2-E2E-01 | Database-backed authorization, invitation concurrency and health access | `pnpm test:e2e:fresh` | **NOT TESTED locally** — constrained free space and no local PostgreSQL image; exact hosted PR CI still required. Existing API E2E suites cover permissions, access expiry/revocation and owner-only actions. |
| B2-VIS-01 | Actual mobile/tablet/desktop, light/dark, simplified-mode screenshots and authenticated visual flow | Browser capture | **NOT TESTED** — no authenticated browser session; limited local disk. Existing design board #13 and #08 were inspected; pet overview CSS from #216 uses the shared health pattern. |

## Decisions and remaining scope

Reviewed requirements include ID-01..ID-21 (especially ID-12, ID-13 and ID-21), PT-01..PT-20, UX-03..UX-05, DS-06/10/14, GC-09/10/12. Existing server-side household, invitation, ownership-transfer and pet/health permission rules were not changed. PR #216's visual alignment is merged, but the account/household visual PR #211 was still awaiting an updated exact-head CI run at this checkpoint.

Household membership management, secure invitation approval/revocation, pet lifecycle/transfer, medical record/document operations, and care scheduling already exist in the repository; this patch does not claim to implement them anew. Older PRs #102, #106 and #121 had green checks on their old heads but showed `DIRTY` merge state against current main; their implementation must be reviewed and retested after conflict resolution, not blindly merged. Authenticated production behavior, multi-household isolation in browser, document permissions, calendar timezone behavior, and full route localization remain **PARTIAL / NOT LIVE_VERIFIED** pending browser and current-head hosted E2E evidence.
