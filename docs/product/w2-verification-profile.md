# W2-2 private applicant profile contract

This additive slice introduces national-ID-card, business-license and Enamad document kinds, plus a private identity profile for existing PROVIDER and SELLER verification subjects.

## Endpoints and access

- `GET/POST /provider/verification/profile`: organization OWNER only.
- `GET/POST /seller-organizations/:sellerId/verification/profile`: OWNER or ADMIN only.
- Existing `GET /admin/verification/:subject/:id` includes `profile`, protected by `verification.manage`.
- General member-readable verification status does **not** include profile PII.

POST accepts firstName, lastName, landline, optional HTTPS websiteUrl and enamadId. Mobile and its verification timestamp are copied from the caller's already-verified account, never from request data. Unverified phones fail with `VERIFIED_MOBILE_REQUIRED`. Profiles are editable only in NOT_STARTED, NEEDS_INFORMATION and REJECTED; other states fail with `VERIFICATION_PROFILE_LOCKED`. Admins request corrected information through the existing audited state transition instead of overwriting an applicant's evidence.

The partner form and admin case display use shared `@petlife/types` contracts. Website URLs are stored/displayed, not fetched, so saving a profile does not initiate an external request or claim that the website is operational. Profile update events exclude names, phones and other field contents.

## Compatibility and remaining policy work

No existing document or verification decision is rewritten. NATIONAL_ID_CARD can satisfy legacy IDENTITY requirements. Commercial BUSINESS_LICENSE and ENAMAD evidence do **not** substitute for a clinical professional licence. No official government lookup is claimed.

Profile capture is available, but this slice deliberately does not change submission/approval prerequisites for old cases. Making the profile and business-license-or-Enamad mandatory for new cases requires a versioned policy rollout with explicit treatment of existing submissions. Insurer/NGO subject integration and that policy rollout remain incomplete. Saving this profile never grants approval or unlocks operational features.

Security reference: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), reviewed 2026-10-24: deny by default, enforce permission checks on every request, test cross-account isolation. Private data is kept out of public/general status DTOs and event payloads.
