# QA pass — 2026-09-03

## Status and isolation
Partial completion: frontend corrections verified; full H01–H11 live regression remains blocked.
Branch: codex/qa-optimize-h01-h11. Base: 92171fd. Original dirty codex/public-landing checkout remains untouched.
Git handoff labels differ from the owner brief: authentication/public browsing is labelled H12 in Git; latest user-support changes are labelled H13 (0eca703). Scope follows domains, not those labels. No automatic merge.

## Fixes
- Landing discovery CTAs use existing public shop, vet and services routes. Private pet actions use the existing protected pet route; welcome uses canonical auth flow. Removed the copied session-storage intent implementation, avoiding a second auth routing system. Demo Cookie never becomes a real pet ID.
- Public header brand returns to the public landing. Login keeps pathname and query.
- Protected AppShell keeps returnTo and shows localized recovery on bootstrap failure instead of an endless skeleton. NotificationBell retained.
- Shop catches request failures, exposes retry and ignores obsolete responses after active-pet changes/unmount. Categories and products fetch concurrently (no new caching architecture).
- Landing palette is scoped to match reference green/ivory/charcoal; shared tokens and other domains are unchanged. Existing spatial landing, reduced motion, keyboard controls, Persian/English copy and image assets retained.

## Validation
- Frontend: 152 tests / 50 files passed; Admin tests intentionally excluded. Covers checkout status, cart, order snapshots, provider/seller, health, notifications, auth/returnTo, landing, error recovery.
- Frontend typecheck and lint passed.
- Frontend production build passed (97 pages); final palette rebuild result recorded separately in qa-web-final-build.log.
- Browser: landing -> public shop stays public. API unavailable: localized retry shown, no login redirect or endless skeleton.
- Browser: fa RTL 375x812, en LTR 1440x900; document scroll size equals viewport, no overflow. English landing console errors empty in inspected tab. These measurements preceded the palette-only correction.
- Root typecheck/lint/build attempted and failed due incomplete backend/config dependencies: missing zod, Node types, eslint/nest executables. Do not confuse with frontend failures or patch source to hide missing modules.
- Full frozen-lockfile install failed: offline argon2 unavailable; online registry requests failed ECONNRESET (including cross-env). Filtered frontend offline install succeeded. Lockfile unchanged.
- API E2E NOT run. Automatic approval review rejected running database-writing tests without a verified isolated test database. Existing WSL Docker socket denies access; sudo requires interactive authentication. No database resets, migrations, seeds, permission changes or DATABASE_URL edits.

## Deliberately not fixed / handoff
- OrdersService.createForCheckout catches P2002 then queries in the same transaction (latent aborted-transaction debt). Only identified caller is finalizeSuccessfulPayment; existing CONFIRMED check and inventory transaction participate in idempotency. Concurrent reachability has not been demonstrated. Do not claim safe/unreachable; reproduce in isolated DB before altering money recovery.
- OrdersService.list is unbounded, though related data is batch-fetched rather than N+1. Pagination changes API contract; report to Claude before implementation.
- Notification polling occurs in one AppShell bell, with cleanup and 30s interval. No demonstrated duplicate polling; unchanged.
- No open redirect regression confirmed by existing returnTo tests. No claim that full security/household/provider/seller isolation was live-tested.
- Full runtime/visual QA of authenticated home, health, checkout, orders, notifications and Provider/Seller OS remains pending API access. No screenshot comparison or accessibility claim for screens that were not rendered with live data.
- No /explore route exists in this baseline; existing public discovery is /vet/find, /services and /shop. No new feature route invented.
- Health landing action currently opens the protected pet list because the active-pet redirect only opens the general pet record. A direct health destination without an active pet requires a product decision; no demo health ID invented.
- H12 avoided: features/admin, API admin/support modules, admin routes, disputes/trust operations, schema/migrations, support/admin stores and services. Existing baseline Admin code is compiled as part of normal web build but its tests and live flows were not exercised.

## Remaining prerequisite
Restore package registry connectivity and provide working local Docker access plus an isolated test database. Then finish API/runtime/security/commerce regression and remaining visual breakpoints before declaring the whole QA pass complete.

## Changed files
Landing route; features/landing/{LandingPage,SpatialLanding,LandingTheme,copy,camera,destination,landing.css,LandingPage.test}; four optimized/local reference assets; AppShell and PublicShell plus tests; ShopHomeView plus test; this report. No shared token changes.

Final palette-only production rebuild: passed. Preview serves this QA worktree on http://localhost:3000/fa (background process); logs: qa-preview-3000.log and qa-preview-3000-error.log. Frontend-only dependency installation intentionally leaves backend tooling unavailable.
