# Batch 7 governance and finance checkpoint — 2026-11-09 UTC

Baseline main and production: `d9d2189c0644d0ac8637b8d2179e94ff29b7a83f`. Independent branch from main. Existing #108 (`feat/py19-zibal-reconciliation`) and #109 (`feat/admin-role-builder`) remain open; neither branch was changed. No payment-named worktree is listed, which does not establish deletion of previous work. All local worktrees and existing changes preserved. No production mutation, ledger entry, wallet adjustment, bank statement, refund or settlement was created. Disk about 137 MiB free; no cleanup or volume change.

Decisions reviewed: BO-06/BO-07 permission scopes and second-person approval; BO-14 versioned settings; AD-05 audit; FE-01/FE-05/FE-14..FE-16 money sources, integer Rial, append-only ledger and correction approval; PY-19 latest owner instruction requires verified evidence/manual approval for duplicate capture (older main row differs; #108 carries follow-up); ER-01..ER-16 accountant-approved accounts, intermediary model and operational workflows. No accounting mapping was invented.

## B7-GOV-01 — P2 cancellation can overwrite reviewed state

`AdminFeatureFlagsService.review` and proposals serialize using a transaction-scoped advisory lock for the flag. Cancellation used only a stale read of PENDING then an unconditional update. A concurrent approval could apply the flag and its audit, after which cancellation could relabel the request CANCELLED, corrupting operational approval history. Cancellation now uses the exact same flag lock and rereads status/ownership after acquiring it. Applied, rejected, superseded and already cancelled requests cannot be overwritten. Successful cancellation retains its existing transactional audit.

Verification at this branch:

- 9/9 feature-flag service/evaluator unit tests PASS, including completion of review/supersession while cancellation waits, requester-only cancellation and atomic audit context.
- 5/5 existing ledger and payment-policy unit tests PASS. These are limited invariants/policy tests, not full gateway, receipt, refund or settlement acceptance.
- 26/26 existing AdminSettingsView/AdminAuditView web tests PASS. No UI, localization or HERO source changed; component tests do not establish full four-language/responsive acceptance.
- Focused API ESLint and diff checks PASS. No schema migration. Real PostgreSQL concurrency E2E, hosted typecheck and production build remain required before merge; no local test DB was initialized on this capacity-constrained filesystem.

## Remaining Batch 7 acceptance and release conditions

- Payment/reconciliation implementation must first reconcile #108 and shared-module ownership before overlapping changes. Automatic refunds of suspected duplicate captures remain forbidden. Current work does not change payment business logic.
- Review #109 custom roles and its base/CI before implementation overlap. Verify server-side city/organization/amount scopes, role assignment, self-approval denial, TOTP/session lifecycle and access revocation with isolated test accounts.
- Effective-date/rollback/emergency-control coverage is not established by this feature-flag cancellation fix. Verify actual runtime gates and audit/version history separately, including in-flight payment safety and payout-only settlement stops.
- ERP final accounting mappings require accountant approval per ER-01. Verify actual ledgers/reports and payroll/contract/assets flows without fabricated journals or approvals; no readiness claim is made for these domains.
- Existing security dependency findings in #227 remain release-readiness blockers pending impact assessment and compatibility-tested remediation. Whole-product security, private data and four-language operational screens remain PARTIAL.
- No new deployment or LIVE_VERIFIED financial/governance behavior claimed. Next action: inspect current PR CI, add/run a real-DB approve-versus-cancel race, then integrate only after protected requirements pass; verify production SHA and safe read-only behavior after the authorized release.
