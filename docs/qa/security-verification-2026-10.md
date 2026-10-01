# Security verification — 2026-10

Baseline: integration/local `069393c` (live, CI 36787681408 green). Every claim of the third-party
report was re-checked against current code and, where possible, reproduced on the isolated preview
(`petlife_final_qa_test`, never live data). Live data was not read or mutated.

| # | Finding | Verdict | Fix / test |
|---|---------|---------|------------|
| A | OTP provider in production | CONFIRMED_P2 + BLOCKED_EXTERNAL | boot guard + `env.spec.ts` |
| B | FK cascade data loss | NOT_REPRODUCED (latent) | — (decide with retention policy) |
| C | Raw-SQL constraint drift | NOT_REPRODUCED | `schema-constraints.e2e-spec.ts` |
| D | Archive / retention | LEGAL_DECISION / PRODUCT_DECISION | — |
| E | Session management | NOT_REPRODUCED (enhancements only) | — |
| F | Temporary pet access | NOT_REPRODUCED | `security-temporary-access.e2e-spec.ts` |
| G | Rate limiting | CONFIRMED_P1 — FIXED | `security-rate-limit.e2e-spec.ts` |
| H | Audit logging | NOT_REPRODUCED (minor gaps) | — |
| X1 | Dev Google sign-in simulation reachable outside production | CONFIRMED_P0 — FIXED | `security-dev-endpoints.e2e-spec.ts` |
| X2 | App ports reachable directly (bypassing nginx) | CONFIRMED_P1 — FIXED in code | loopback defaults |
| X3 | Live served over plain HTTP | CONFIRMED_P1 — BLOCKED_EXTERNAL | needs domain + TLS |

## A — OTP provider
- Claim: production can run a development OTP provider and log codes.
- Evidence: `OTP_PROVIDER` accepts only `dev`; `DevOtpProvider` is bound unconditionally. It already
  withholds the code from logs when `NODE_ENV=production`, but production booted with it and every
  OTP sign-in would silently fail. No OTP provider on the Faraz/MessagingGateway exists yet
  (`FarazSmsAdapter` serves notifications only).
- Fix: `validateOtpConfig` — `NODE_ENV=production` + `OTP_PROVIDER=dev` fails at boot.
- External: a real OTP delivery provider needs Faraz credentials → BLOCKED_EXTERNAL. The live
  server runs in development mode (codes appear in the server log); that is an ops decision tied to
  launch, recorded in the backlog.

## B — FK cascade
- 122 `onDelete: Cascade` relations (40 under Pet/User/Household/Order/Booking).
- Reachability: no product code or raw SQL hard-deletes a Pet, User, Household, Booking, Order,
  medical record, financial or donation row. Pets are soft-deleted (`deletedAt`). Account deletion
  requests are recorded and cancellable but never executed. Memorial/deceased/transfer are
  lifecycle states, not deletes.
- Verdict: NOT_REPRODUCED. Latent risk: whoever implements deletion processing must first decide
  retention (D) and switch financial/medical/audit children to Restrict or archival.

## C — Constraint drift
- `schema-constraints.e2e-spec.ts` replays all migrations (add/drop/rename, dropped tables) and
  asserts every CHECK constraint and index exists. PASS on a fresh DB and on upgraded copies
  (`petlife_batch2_test`, `petlife_b6_upgrade_test`, `petlife_final_qa_test`). Runs in CI.

## D — Archive / retention
- Technical: export, deletion request, consent records exist; `retention.policyPublished=false`.
- Owner/legal decisions (unresolved): account-deletion retention window and what is anonymised vs
  kept; medical record retention (vet obligations); pet transfer of ownership; financial record
  retention (tax/accounting). Nothing was implemented — generic soft-delete was deliberately not added.

## E — Sessions
- HMAC-signed cookie with timing-safe compare; server-side revocation; new session id on every
  sign-in; password change/reset revokes all; logout current/others/all; absolute 30-day expiry;
  `lastSeenAt` and device label for the Security Center; httpOnly + SameSite=Lax.
- Enhancements (not vulnerabilities): idle expiry, concurrent-session cap. The `Secure` flag is
  production-only and live has no TLS — see X3.

## F — Temporary access
- All effective permissions resolve through `PetAccessService.getEffectivePermissions`
  (`isGrantActive`: revoked, startsAt, expiresAt). Direct `revokedAt: null` queries are listings that
  re-filter with the same window (privacy sharing, vet registry) or the household view (UI filters
  with `isActive`).
- Spec proves valid / not-started / expired / revoked / booking-active / booking-ended on guarded
  routes, and that expiry takes effect immediately without a cleanup job.

## G — Rate limiting (fixed)
- Reproduced on the preview: a sign-up through nginx recorded the loopback address as the client
  IP. The API never trusted its proxy, so every visitor shared one throttle bucket (5 OTP requests a
  minute for the whole site) and no per-IP limit applied to any client in particular.
- Fix: `TRUST_PROXY` (default `loopback`); per-identifier Redis budgets — OTP send 5/h, failed OTP
  10/h across codes, failed password 10/15 min per username (identical for unknown usernames),
  password reset 3/h per identifier (silently dropped, same response). The spec fails without the fix.
- Anonymous mutations reviewed: auth routes (throttled), lost-pet sighting upload (10/min),
  community reports (10/min), signed upload PUT (token-gated), payment/shipping webhooks (sandbox).

## H — Audit logging
- `AdminAuditLog` is written by admin finance, refunds, settlements, commerce, travel, insurance,
  places, trust, disputes, verification, moderation, content, subscriptions, support and tasks; PII
  reveal is audited with a reason. Consumer security events: sign-in, password change, reset
  requested/completed, session revoked, all sessions revoked; household and pet-access changes.
- Gaps (P2): admin role changes have no API yet (Batch 7 Access Control); repeated failed sign-ins
  are throttled but not surfaced to the account owner.

## X1 — Development Google sign-in simulation (P0, fixed)
- A test-only endpoint could establish a session for an arbitrary Google identity whenever
  `NODE_ENV` was not `production`. Reproduced on the preview against a QA account. A server running
  in development mode while publicly reachable is exposed.
- Fix: requires `GOOGLE_DEV_SIMULATE_ENABLED=true` (default false; only the e2e setup opts in) and
  is refused in production regardless. Preview patched and verified (`GOOGLE_AUTH_DISABLED`).
- Shipped first as a security-only hotfix (`claude/security-hotfix`).

## X2 — Direct port exposure
- API :4000 / web :3000 (and preview :4100/:3100, bypassing its basic auth) answered from the
  internet. Code now binds to 127.0.0.1 by default (`HOST`, `next start -H ${WEB_HOST}`); nginx and
  the deploy smoke checks already use 127.0.0.1. Preview verified closed. A host firewall is still
  recommended.

## X3 — No TLS on live
- Live is served on `http://185.231.112.154`; session cookies cannot be `Secure`. Needs a domain and
  certificate → BLOCKED_EXTERNAL, launch blocker.
