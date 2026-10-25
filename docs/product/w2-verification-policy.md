# Versioned mandatory partner verification

## Rollout

New PROVIDER and SELLER submissions use policy `2026-10-25.1`. The nullable `verificationPolicyVersion` column is added to each organization without rewriting existing rows. Previously submitted/approved cases with null retain the compatible legacy evidence requirements. Requesting more information and resubmitting adopts the new policy. Unknown non-null versions do not select the legacy policy.

## Required before submission and approval

- Explicit NATIONAL_ID_CARD evidence.
- BUSINESS_LICENSE or ENAMAD evidence, **or an Enamad ID** in the private applicant profile.
- First name, last name, landline, E.164 mobile and valid mobile verification proof.
- Clinical providers additionally need the existing professional LICENSE evidence. Commercial evidence never substitutes for that licence.
- Pending, unexpired evidence can be submitted; approval requires accepted, unexpired evidence. An Enamad ID is subject to the admin's manual review, not an official automated lookup.
- The profile's verified mobile must still belong to its recording account, that account must be active, and its mobile must still be verified. Revoked proof blocks approval, including legacy PATCH routes.

Submission records the policy version in the same serializable transaction as the state change and event. Profile mutation and admin approval are also serializable. The admin's audited decision remains the only activation path; a complete checklist never auto-approves a partner.

## UI and contracts

Shared `PartnerVerificationPolicyDto` adds `requiredProfileFields`, `missingProfileFields` and `requiresBusinessEvidence`. No PII is added to the general status response. Both partner and admin checklists use server requirements, with Persian/English labels. Saving identity details refreshes the partner checklist. The admin approval control is unavailable while contact proof is missing, and the API independently enforces it.

No existing approval is automatically suspended or revoked. Insurer and NGO subject integration, scoped admin-role expansion, and gallery enforcement remain separate open work.

## Acceptance

Integration tests cover new provider and seller submissions, missing profiles, accepted versus pending evidence, revoked phone verification at admin approval, legacy cases, professional licences and audited approval/reinstatement. Pure policy tests cover business-evidence alternatives and mandatory field checks. UI tests cover the localized combined checklist and profile-save refresh behavior.
