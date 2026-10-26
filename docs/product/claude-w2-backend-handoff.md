# Claude Code — backend completion and security handoff

You own backend for apm1368/petlife-os. Codex owns frontend concurrently. Respond to Pedram in Persian; code, commits and PRs in English. Read current branches and issue #4 before changing anything. Do not assume this document's SHA remains latest.

## Ownership and workflow

- Backend only: apps/api, additive Prisma migrations, packages/types and packages/validation, backend tests/docs. Do not edit apps/web or packages/ui; coordinate contract changes on issue #4.
- Preserve other agents' work. Use small topic branches/PRs against stabilization/wave-1. Update existing #74/#75 for fixes rather than duplicating them. No direct main push or independent production release while Codex coordinates frontend.
- Run heavy commands through flock /var/lock/petlife-build.lock. Use a separate disposable test database per branch (and a separate combined-integration database); never reset a shared or production database. Keep migrations additive and never print secrets.
- “Contract ready”, “CI passed”, “merged”, and “live” are separate states. Report remaining gaps explicitly, not entire topics as done prematurely.

## Priority 1 — repair W2-4 / PR #74 BEFORE release

At reviewed SHA 3370fcc, SERVICE_ADMIN has services.view/manage but AdminServicesController has no vertical enforcement. GET /admin/service-bookings, /provider-services, /provider-reviews, /service-waitlist, /services-analytics and booking detail can cross scopes; service activation and review hiding also lack subject-scope checks. An empty serviceScopes therefore does NOT currently deny all data.

1. Enforce scope in DB predicates for lists/counts/aggregates and independently on every detail/mutation. A controller decorator alone cannot distinguish clinic versus grooming rows sharing a controller. Caller-supplied providerId must never widen scope. Empty serviceScopes must fail closed. Audit the full reachable surface: customer overview/search, tasks, places, verification, travel/external, insurance and shared dashboard counters. Preserve established access for legacy unscoped roles.
2. Add audited service-scope management to existing admin access APIs: validated serviceScopes on grant/change, read it in list/detail, and an explicit update operation if needed. Only admin.manage may change it. Define allowed combinations and clear stale scopes on role changes. Expose the exact DTO/endpoints before frontend integration; currently the UI must not invent a scope editor.
3. Return effective scope/capabilities consistently so Codex can hide unavailable sections, but server remains authoritative. Document null (unscoped) versus [] (no access).
4. Add HTTP tests with real clinic AND grooming rows: list, detail, mutation, totals/search, empty scope, forged providerId, role/scope change without new login. Assert successful allowed requests are 200/201, not merely “not 403”; missing/404 routes must not pass permission tests. Test #74 and #75 together.

## Priority 2 — complete W2-5 / PR #75 contract

Codex is implementing /admin/users and /admin/users/:id against AdminUserDirectoryListDto and AdminUserProfileDto from SHA 6296337. Keep these additive/backward-compatible. The frontend will show masked contacts, all role/business relationships, account status, joined/last-active dates, counts and a link to existing Customer 360; it will not pretend the two counts are a full profile.

1. Complete the required detail contract: households/pets, businesses, orders, service requests, tickets, reviews and audit, with pagination and explicit per-section permissions. Reuse Customer 360 where appropriate, but do not expose cross-vertical rows through it to newly scoped roles. Clearly distinguish forbidden/unsupported from genuinely empty sections.
2. Make lastActiveAt updates concurrency-safe (conditional updateMany using the stale timestamp predicate), rather than a stale read followed by unconditional update. Cover first activity, concurrent requests/multiple sessions and the 15-minute write limit.
3. Avoid fetching every matching membership id into application memory before pagination for kind filters. Prefer relation predicates/EXISTS or a bounded SQL query; maintain stable pagination with an id tie-breaker. Specify active/removed/suspended membership semantics consistently.
4. Test all role sources, masked PII, no-permission/changed-role access, combined #74 scoping and pagination. Post the final DTO and endpoint contract on #4.

## Priority 3 — W2-9, W2-10 and W2-12, separate PRs

- Reviews: existing legitimately public reviews remain APPROVED; existing hidden/rejected reviews must NOT be resurrected by backfill. New product/provider/travel reviews default PENDING. Only APPROVED contributes to every public list, detail, count, aggregate and cached rating. Audited approve/reject with reason, correct scoped authorization, idempotent/concurrency-safe decisions; define whether editing an approved review re-enters moderation and test it. Export unified queue/detail/action DTOs for frontend.
- Products: explain Product/Variant/Offer ownership and creation paths. New/edited seller content enters PENDING_REVIEW; no public visibility bypass through variants, offers, search, checkout or direct IDs. Choose and document safe behavior for edits to already approved products; preserve existing orders/snapshots. Admin detail includes all media, variants, prices, stock and species. Audited decisions and cross-seller/scope tests.
- Memorial: owner-only explicit confirmation of death; public visibility requires separate opt-in consent. Consent revocation removes the entry from feed/cache immediately. Urgent internal follow-up task/notification, no public owner/contact data. Reuse lifecycle data, preserve history, make repeat calls safe. Add permission/privacy/revocation tests and export feed/admin contracts.

## Acceptance per topic

Additive migrations + shared DTOs + positive and negative e2e tests + passing CI + exact contract line on #4 + concise Persian owner summary. No real SMS to arbitrary numbers; use approved test recipients only. Do not report live until the release SHA and readiness have been checked on opetlife.ir. Send Codex endpoint, field, enum, error-code and permission changes before expecting frontend work.
