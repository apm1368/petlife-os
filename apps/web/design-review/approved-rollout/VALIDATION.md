# Validation and release limits

Application code tested: `f492289` (combined branch includes commerce commit `9439c14`). Documentation/evidence-only commits may follow. Base: `a5a672d`; the latest public fetch of `origin/stabilization/wave-1` still pointed to that SHA during verification.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed, pnpm 10.33.0; lockfile unchanged. |
| `pnpm lint` | Passed; 3 existing warnings in AdminContentMediaView, RichTextRenderer and VetShareView. No lint rules were weakened. |
| `pnpm --filter @petlife/web typecheck` | Passed. |
| `pnpm --filter @petlife/web test` | **666 tests passed in 167 files.** No skipped/disabled tests added. |
| `pnpm typecheck` | **Blocked in @petlife/api**: ungenerated Prisma Client, e.g. missing HouseholdRole/HouseholdMember/InputJsonValue exports. Other packages/web completed successfully. No fake Prisma declarations, TLS bypass or checksum bypass used. |
| Main browser capture | 24/24 checks passed: clinic list/profile, blog/article, contact, admin; fa/en, 390/1440. No document horizontal overflow or uncaught page errors. |
| Additional browser capture | 16/16 checks passed: booking, support board, taxi list, owner clinical records; fa/en, 390/1440. |
| Commerce browser recheck | 24/24 passed after the shared-pattern changes; fa/en, 390/1440, six commerce screens. |
| Actual before captures | 16 new-domain captures at `a5a672d`, not mockups; the existing shop evidence also includes 12 actual baseline captures. Recorded in `screenshots/before-checks.json` and any supplemental baseline checks. New contact/clinical pages have no fictional “before”. |
| Protected paths | No application diff in apps/api, prisma, .github/workflows, scripts, deploy.sh, docker-compose.yml, AdminShell.tsx or admin crm/customer-affairs. |

All browser data is controlled fixture data. Photos used as review article/provider content are fixtures, not seeded application content. The backend was not run, migrated or modified. No live payment, email, chat, support message or production write occurred. The automated tests cover actual request contracts and permission/error behavior; browser results do not certify every role or every route on a real server.

## Relevant regression coverage

- Contact: guest drafts survive sign-in navigation; no unauthenticated create call; failed submission preserves input; retry uses a real returned case ID.
- Owner medical records: unresolved/no edit permission exposes no writes; clinician-authored data uses correction requests instead of PATCH/DELETE.
- Clinical operations: no write UI for read-only grants; a failed lab write preserves the draft; reversed estimate ranges are rejected.
- Availability: editing PATCHes the existing rule; conflicting blocks require explicit acknowledgment and do not cancel bookings.
- Admin home: forbidden queues are neither requested nor linked; a failed queue is not displayed as empty.
- Plans: read-only admins cannot create prices/plans or maintain entitlements.
- Existing shop/booking/insurance/refund/privacy and RTL flows remain in the full passing suite.

## What remains blocked or unverified

1. GitHub write authentication is unavailable: no push, PR, board comment, merge or deploy is claimed. The combined Git bundle/patch is a local handoff.
2. Restore legitimate Prisma generation and run the authoritative repository CI before opening/merging a release PR. The frontend-only pass is not a replacement for the root gate.
3. Wider backend/UI coverage has unresolved candidates and genuine frontend work. Read `API-DISPOSITIONS.md`; do not equate applying domain tokens with implementing a missing feature.
4. The backend handoff identifies provenance and admin-search authorization issues needing server fixes. UI hiding is not server authorization.
5. Protected admin navigation/CRM/customer-affairs remain the other lane's responsibility. No claim that all former admin overflow reports were individually reproduced or fixed.

Heavy validation on the VPS must use `flock /var/lock/petlife-build.lock`; this work ran in the cloud workspace, not the VPS. Deployment remains an owner/Claude action after the required gates.

## Follow-up code `7a4ee65`

- Full web regression run: **669 tests / 168 files passed** before the final content-version follow-up. Subsequently all changed clinic/content components passed **12 targeted tests / 3 files**, including two newly added notes tests and two new version-history tests. This is not a claim of a fresh full 673-test run.
- Web typecheck passed on the final code. Root lint passed; a new ref warning was then fixed and targeted lint passed with zero findings on all newly changed implementations. The three historical warnings remain as described above.
- Clinic workspace browser captures: **4/4** fa/en at 390/1440, no overflow or page errors, controlled data. Total captured browser checks now 68; this does not certify every one of the 293 routes.
- Latest supported Git credential-helper push attempt was rejected by GitHub with `Invalid username or token`. Read-only public fetch still works. No PR, board edit, push, merge or deployment is claimed.
- Clinic workspace features implemented: queue and booking links, task create/done/cancel/status filter, entitlement-gated paginated customers, current plan/usage, customer notes with explicit sharing and author/owner-only removal. Campaigns, imports, team/branch maintenance and clinic finance remain separate frontend work, not missing APIs.
