# Batch 8 — Account, Security, Privacy, Household Access, Notifications and Membership QA record

Branch `claude/batch-8-account-security` from `b190f68` (live and integration/local at start; CI green). Sub-batches 8A–8H are separate commits.

| Sub-batch | Commit |
|---|---|
| 8A Account shell, safe profile, verified contacts | `4337435` |
| 8B Household membership, access lapses, invitation fixes | `7e75bc3` |
| 8C Security Center, sessions, sign-out, security notices | `2ce8ca5` |
| 8D Privacy: consents, sharing, export, deletion | `9f77982` |
| 8E Notification preferences the backend honours | `fcf2464` |
| 8F Owner-only membership billing, honest membership states | `26fa6ef` |
| 8G Activity API / activity page, system states, invitation errors, 404 | `4c03fb9`, `5f3eacd` |
| 8H Security regression, QA seed, accessibility, docs, registry | `5ea8b75` + docs commit |

## Grade scale used in the route registry
- **A** — complete; verified on the isolated preview with seeded data in fa (RTL) and en (LTR) at 1440/1024/768/430/390/360: no horizontal overflow, no stuck skeleton, axe WCAG 2.1 A/AA clean at 1440 and 390; behaviour covered by automated tests.
- **B** — complete and covered by automated tests; rendered on the preview but not every state inspected visually, or an older view only partly reworked.
- **C** — honest degradation / older view not reworked in this batch.

## Security defects found and fixed
- `GET/PATCH /me` returned the raw user row including `passwordHash`.
- Pre-account-takeover: Google and email-OTP sign-in attached to any account holding that email, even one whose email was typed (never proven) at password sign-up — the squatter kept the password and sessions. Contacts now carry `emailVerifiedAt`/`phoneVerifiedAt`; the first proof clears an unproven password, all sessions and reset links.
- OTP codes could be used twice under concurrent submission; password-reset tokens likewise; other outstanding reset links survived a reset.
- Any household member (not only owners) could subscribe/upgrade/downgrade/cancel/resume the household membership and read its billing.
- The web app had no sign-out anywhere.
- Notification in-app toggles were decorative (never consulted); marketing could reach the inbox without consent.
- Household invitations stripped hyphens from emails, so invitees with such addresses were never found or notified.
- Removing access skipped grants whose `reason` is NULL (SQL `NOT` on NULL).
- Members received each other's email and phone in the household payload.
- Pet access failures gave a generic error; now `PET_ACCESS_DENIED` carries the caller's own lapse (EXPIRED / REVOKED / NOT_STARTED) and the UI explains it.

## Automated gates
| Gate | Result |
|---|---|
| `batch8-account.e2e-spec.ts` | 23 / 23 — no password hash; contact change by code, no account probing; pre-takeover guard; OTP single-use race; invitations single-use / bound / expired / revoked / already used / not for you; remove member (grants revoked, lapse REVOKED, notified); last-owner guard; temporary grant window + EXPIRED lapse; own sessions only, revoke / revoke-others / revoke-all and race; security notices incl. non-suppressible; reset links single-use, superseded, no enumeration; required vs revocable consents and marketing gating; sharing summary; export build → private file → owner-only 5-minute download → expiry; member export scoped (no health without permission, no other member's memories); deletion re-auth, blockers, cancel; in-app preference honoured; owner-only membership + sanitised billing; activity ownership/filters/pagination/safe detail; forged-id IDOR sweep; CSRF on account mutations; returnTo sanitizer |
| Full API e2e (16 suites) | 513 / 513 |
| API unit | 51 / 51 |
| Web tests | 134 files / 471 tests |
| Workspace typecheck / lint / production build | green (lint: 4 pre-existing `<img>` warnings) |
| Fresh database | all 40 migrations from zero; schema diff only the known PostGIS index; `prisma validate` ok |
| Upgrade path | `petlife_b8_test` started at the live base and applied each Batch 8 migration incrementally |

Migrations (additive only): `202610010001_batch8_contact_verification` (two nullable columns + backfill from provable data), `202610010002_batch8_privacy_requests` (enum value, nullable/defaulted columns, index).

## Isolated preview
API `:4100` + web `:3100` on `petlife_b8_qa_test` (Redis DB 9, local storage dir of its own). `seed-batch8.ts` is idempotent (ran twice), refuses the production database, and records no captured payment. The preview's renewal worker was slowed so the seeded PAST_DUE / GRACE states stay put (it had "renewed" the grace household with the dev-simulated charge — which is why simulated payments are now labelled "test payment (not charged)").

### Accessibility and responsive matrix
axe-core 4 (WCAG 2.0/2.1 A + AA) on Overview, Personal, Household, Membership, Notifications, Security, Privacy, Activity — fa and en at 1440 and 390: **0 violations** after darkening `--state-success` (3.6:1 → 5.4:1). Overflow/skeleton sweep on the same pages at 1440/1024/768/430/390/360 in both locales (96 checks): 0 overflow after fixing the pet-access cards at 1024, 0 stuck skeletons, `dir` correct everywhere. Keyboard: Tab reaches destructive actions; confirmation dialogs are native `<dialog>` (focus moves inside, Esc closes); the marketing switch is a labelled `role=switch` with a visible focus ring. Localized 404 renders RTL with a way home.

### Findings fixed during QA
Pet-access cards overflowed at 1024; status labels wrapped to three lines at 390; Latin digits in Persian counts and membership usage; raw membership status in the deletion preview; simulated renewal shown as "paid".

## Known limits (documented, not faked)
- OTP / password-reset delivery uses the development provider; production SMS (Faraz) and e-mail are not configured — BLOCKED_EXTERNAL. Google sign-in is disabled (shown as unavailable).
- Membership payments are sandbox only (labelled); automatic renewal is not real.
- Account deletion is recorded and cancellable but not processed: no data-retention policy is published (owner/legal decision).
- Terms/Privacy acceptance has never been recorded at sign-up (0 consents live); the Privacy Center lets people accept the current version (owner/legal decision on sign-up flow).
- No pet-transfer flow exists (only a lifecycle status).
- Complimentary access exists only as an admin entitlement override (no complimentary subscription status).
