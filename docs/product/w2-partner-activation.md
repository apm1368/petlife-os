# Wave 2 partner activation — first enforcement slice

## Decision and research

Reviewed 2026-10-23: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
Apply deny-by-default, permission checks on every request, and integration tests for authorization. Verification is an additional restriction, never a replacement for organization membership or staff role checks.

## Implemented contract

- Provider services and availability controllers require `VERIFIED`; service variant mutations require the same check.
- Seller offer creation (which creates an active offer) and updates explicitly requesting `ACTIVE` require `VERIFIED`.
- Admin offer moderation can only release suspension to `PAUSED`, not activate offers; the seller activation check cannot be bypassed through that route.
- Host listings cannot be approved or reinstated for publication by admins unless the host organization is verified. Drafting, corrections and suspension stay available.
- Failure: HTTP 403, `error.code = PARTNER_NOT_VERIFIED`, `error.details.verificationStatus` containing the organization's current state.
- Membership is resolved on each request. Approval, suspension and reinstatement through existing admin review routes take effect on the next request.
- Verification status, evidence submission and existing seller offer reads/pausing remain accessible, subject to existing permissions and seller operational status.
- Provider service/availability pages display a verification notice instead of mounting protected children. Seller offer pages retain existing offers and replace creation with a verification link. The API remains authoritative.

## Admin management and acceptance

Existing `/admin/verification` queue and detail screens provide private evidence review and audited state transitions; no separate bypass or automatic approval is added.

`erp-c-partners.e2e-spec.ts` verifies all six unapproved provider states, method-level variant enforcement, blocked seller creation/activation without writes, continued pausing, and real admin approval → suspension → reinstatement against the same signed-in provider session. Existing document-review, permission and audit tests are retained.

## Remaining W2-2 scope (not claimed complete)

- Additive national-ID/business-license/Enamad kinds and profile fields, verified phone binding, required-evidence alternatives.
- Insurer/NGO partner subject support and admin review of all new fields.
- Gallery and any alternate publication paths; calendar UI is gated alongside its availability API, while existing booking reads and cancellation are intentionally preserved.
- Automatic cross-tab context refresh is not implemented. The notice provides an explicit page reload to fetch new approval state; API checks already read fresh state.

Every subsequent feature must include admin discovery, appropriate scoped read/write permissions, audited consequential mutations, and UI + API acceptance evidence. Administrative actions must preserve evidence requirements rather than becoming an unchecked override.
