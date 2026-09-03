# Integration recovery — 2026-09-03

Status: Git and frontend integration complete. End-to-end API/database recovery is NOT complete.

## 1–4. Cause, served branch and merge
The preview process was still serving `.worktrees/qa-optimize-h01-h11` (b8882c0), not the latest Claude baseline. An earlier preview served the H09-based `codex/public-landing`; the user's browser also retained its old `/fa/auth` page with only two login options. Neither represented H14. Missing API dependencies and unavailable Postgres independently prevent actual login/data flows.

`integration/local` starts at c923699. The interrupted b8882c0 cherry-pick was deliberately resolved and completed as **aedaf24**. Only AppShell's import conflicted: the merged import contains Avatar, ErrorRecovery, IconButton and Skeleton. Claude's Support entry and NotificationBell remain, together with Codex localized error recovery and returnTo. Seller/Admin H14 finance navigation and all backend financial code remain unchanged.

8c2ea21 is preserved on codex/public-landing. It was not merged. No files/assets were extracted from it. The QA worktree remains as history, but its preview process (14036) was stopped. The new background web process serves the ROOT checkout on port 3000. Root must remain on integration/local while this preview is used.

## 5–6. Authentication
The integrated code and UI contain username/password login, registration, email/phone OTP, Google OAuth architecture and password recovery/reset. User normalizedUsername/passwordHash and AuthIdentity exist in Prisma schema. Browser inspection of `/fa/welcome` confirmed four buttons including username and create account. `/fa/register` showed username/password, optional display name/email, and the login link.

Actual registration/login/OTP completion is NOT verified because the API cannot currently start and Postgres is unavailable. OTP_PROVIDER is dev: once running, codes are printed in the API terminal. Google remains conditional on configuration; no fake success or enabled Google button was added. No credentials were entered into the browser or accounts created in this pass.

## 7–9. Routes and protection
See [routes.md](routes.md), generated from the actual route tree. Public discovery: `/fa/shop`, `/fa/shop/products`, `/fa/shop/products/[id]`, `/fa/vet/find`, `/fa/vet/[providerId]`, `/fa/services`, `/fa/services/[category]` (and en equivalents). Booking pages in the public route group are wrapped in RequireAuth.

Authenticated app routes include home, pets, pet health/care, cart, checkout, orders, notifications/preferences, bookings, support/new/tickets. Provider, Seller and Admin retain their separate role/permission shells and server authorization. Health API retains SessionAuthGuard + PetAccessGuard; notifications retain SessionAuthGuard. No private API was made public.

Added minimal returnTo preservation to ProviderShell, SellerShell and AdminShell, including query parameters. Previously they discarded the portal destination on login. Three new regression cases verify redirect targets and no private content for anonymous sessions. The existing AppShell test now also verifies the H13 Support button and H10 notification bell survived integration.

HTTP smoke checks returned 200 for `/`, `/fa`, `/en`, welcome, register, password account, shop, vet/find, services, home, pets, orders, notifications, support, provider, seller/finance and admin/seller-finance. These prove page serving, NOT authorization success or live data availability. Dynamic product/health pages were not tested with fabricated IDs. Post-login portals and domain content remain unverified without API/DB.

There is no standalone `/auth`, `/login`, `/explore`, `/health` or `/vet` page. Use `/[locale]/welcome`, `/[locale]/account`, `/[locale]/register`, `/[locale]/pets/[id]/health`, `/[locale]/vet/find`. `/[locale]/auth/complete` is the OAuth completion route. No speculative route added.

## 10. Seed/dev identities
These are SOURCE-DEFINED DEV identities, not verified existing records in the current DB:

| Purpose | Entry defined by seed |
|---|---|
| Consumer | username `demo`, password `dev-only-password`; own Buddy pet and completed onboarding |
| Consumer reference data | `sarah@example.com`, dev email OTP |
| Provider | `dr.sara.vet@example.com`, dev email OTP; clinic owner membership |
| Admin | `admin@example.com`, dev email OTP; SUPER_ADMIN |
| Support admin | `support-admin@example.com`, dev email OTP |
| Finance admin | `finance-admin@example.com`, dev email OTP; FINANCE |
| Seller | Seller organizations exist in seed, but no SellerMembership fixture was found in prisma/seed.ts; usable seller identity remains a confirmed seed-strategy gap requiring DB inspection and a minimal DEV-only membership seed |

Do NOT rerun the full seed on the existing H09 database: multiple core functions use create rather than upsert. The demo-account function is idempotent but only called at the end of that full seed. No database records, passwords or memberships were changed here; no production backdoor or real credentials added.

## 11–13. Infrastructure and migrations
- Full frozen-lockfile pnpm install attempted with C:/pnpm-global/pnpm.ps1. Seven missing tarballs repeatedly failed ECONNRESET from registry.npmjs.org; independent curl HTTPS probe timed out. Lockfile unchanged.
- Missing argon2 and jose prevent API typecheck/build/start. API lint also lacks its executable link after incomplete install. Source was not changed to hide this.
- Prisma generate succeeded against the integrated schema (Prisma 5.22.0).
- Prisma migrate status attempted against configured **127.0.0.1:5432/petlife_os** and failed. TCP probe reported unavailable/refused. No migration was applied or reset; H14 DB currency is UNKNOWN.
- 18 migrations exist on disk, including seller_financial_settlement, auth_google_password_identities and support_case_sla_timestamps. Presence is not proof of application.
- Ubuntu initially reported Docker active, but docker socket permission denied and sudo required interactive authentication. A subsequent WSL invocation timed out creating the VM; later `wsl --list --verbose` showed Ubuntu stopped. Docker Desktop was not used. No permissions, authentication, firewall, database URL or network settings were weakened.
- Web is running from integration/local on http://localhost:3000; API + DB are NOT running coherently yet.

## 14. Verification
- All frontend tests: **211 passed, 69 files**, including H13 support and H14 finance plus new integration tests.
- Frontend standalone lint and typecheck: **passed**.
- Clean frontend production build: **passed**. The first web build failed on missing generated `.next/server/pages/_document.js`; cleared only verified root apps/web/.next and rebuilt serially. No product source workaround.
- packages/types rebuilt before consumers; Prisma client regenerated.
- Root typecheck: failed only API's missing argon2/jose (8 of 9 tasks succeeded).
- Root lint: failed on missing API eslint executable.
- Root build: failed on missing API dependencies.
- Backend E2E not run: dependencies missing, database unavailable, and no verified isolated test DB. The earlier QA review rejected writing tests against an unidentified shared DB; that restriction was not bypassed.

Logs remain local and ignored: integration-web-tests.log, integration-web-build-clean.log, integration-web-typecheck.log, integration-web-lint.log, integration-typecheck.log, integration-lint.log, integration-build.log, integration-route-smoke.log, integration-web-runtime*.log.

## 15–16. Remaining work / Claude handoff
Restore access to official npm and start Ubuntu Docker with interactive authorization. Then install locked dependencies, regenerate Prisma, inspect migration status and apply pending existing migrations with db:migrate:deploy. Inspect existing records before any seed. Add only missing DEV seller access using an idempotent seed, verify seeded login/onboarding behavior, and test actual consumer/provider/seller/admin flows with an isolated E2E database. Full seed rerun is unsafe without inspection.

The frontend/root branch fragmentation is repaired, but do not mark this recovery successful until username/password and OTP login, database migrations, authenticated domain pages and role portals have been verified against the live API.

## 17. Commits
- aedaf24: completed intentional b8882c0 cherry-pick onto c923699.
- Follow-up commit: portal returnTo fixes, integration regression tests and this report/route inventory (see git log).

No push, no Claude-branch commits, no old-WIP wholesale merge, no history rewrite.
