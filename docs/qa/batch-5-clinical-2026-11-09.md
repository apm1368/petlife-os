# Batch 5 clinical checkpoint — 2026-11-09 UTC

Baseline main: `d9d2189c0644d0ac8637b8d2179e94ff29b7a83f`; production reports `7944df41d990a49364c45f1899bf6e245b43b778`. Existing worktrees remain intact; no payment edits, production writes, migrations or cleanup performed. Disk remains about 137 MiB free. Independent branch from main; PR #227 is unrelated SEO/hardening work and is not a dependency.

Decisions inspected: VT-01..VT-20 (consent, separate clinic roles, provider provenance and clinical records), OR-01 (private clinical notes), GC-09/GC-10 (localization/direction). Visual reference: `docs/design/references/reference-09.png`, plus the shared product-design reference. No example clinical data was copied into the product.

## CLIN-01 — P1: completed notes can be overwritten by a racing edit

`ClinicalVisitService.updateNotes` checked DRAFT/IN_PROGRESS with a preflight read, then wrote by visit ID alone. Completion between those operations could permit silent mutation after completion, bypassing the required revision/amendment history. The mutation now uses a transactional conditional update scoped to visit, pet, clinic and editable status. If completion or voiding wins, the notes request returns the existing invalid-transition error; it does not silently write or fall back to amendment. A subsequent read occurs in the same transaction after successful write. Existing clinical completion and amendment APIs remain separate from scheduling/booking.

Local regression tests: 6/6 PASS in `clinical-visit.service.spec.ts`: open visit save, foreign-clinic denial, direct completed/amended/voided denial and a simulated completion after preflight. Focused API ESLint and diff checks PASS. Hosted real-DB E2E/build/typecheck must pass before merge. No local real-DB concurrency claim is made.

Existing HTTP E2E coverage reviewed: `clinical-health.e2e-spec.ts` includes provider start/document/complete/amend with preserved revisions, cross-provider denial, private documents and concurrent completion. `clinic-cross-org.e2e-spec.ts`, `clinic-os.e2e-spec.ts` and `vet-clinical-panel.e2e-spec.ts` remain part of the hosted acceptance suite; previous passes are not counted as fresh verification of this branch.

Web regressions: 28/28 PASS across ProviderClinicalVisitView, VetClinicalDashboardView, ClinicalRecordActions, ClinicWorkspace and ClinicTeamManagement. These are component tests; they do not establish four-language or full clinical acceptance. No UI source was changed in this slice.

## Remaining work / exact next actions

- Clinical workspace already has visits, observations, documents, orders, referrals, care plans and roles; do not recreate these models. Verify complete authorized lifecycle on an isolated DB, including expiry, consent and role changes, and inspect amendment/void concurrency separately.
- Authenticated fa/en/de/es browser, dark/light/simplified and mobile/tablet/desktop checks remain NOT_TESTED for this batch. Use controlled fixtures only; no patient screenshots. The reference board was inspected, but no visual completion claim is made.
- Prescriptions, lab/image results and provider-authored notes must retain actual provenance; do not fabricate external results, signing or delivery integrations.
- Existing dependency audit in PR #227 reports critical/high production advisories and remains a release-readiness blocker requiring compatibility-tested remediation. This clinical fix does not resolve that finding.
- Production clinical flow is NOT LIVE_VERIFIED; no authorized QA account or isolated clinical dataset was used on production. Next session should read this checkpoint, verify current PR CI and run the clinical HTTP suites before release.
