# API coverage: decisions and open work

This file supplements the single backend handoff. It is not a declaration that every backend operation now has a frontend. The reproducible JSON inventories **1,079 controller declarations**; normalized route aliases can describe the same operation. Query wrappers and inline `apiFetch` calls are included. Runtime role/entity checks remain separate.

## Existing UI uses an aggregate or a replacement API

| Unreferenced wrapper | Existing UI / decision |
| --- | --- |
| `providersService.searchVets/getProfile/getAvailability` | Clinic discovery/profile and booking use `discoveryService` and service availability. Do not build a second competing directory. |
| `servicesService.listCategories/search` | Current discovery filters use the typed category vocabulary and `discoveryService.search`. Review any future category-contract change against that vocabulary. |
| `homeService.get` | Member home uses the active pet's overview plus real booking/order/activity sources. The generic old home wrapper is not used to inject sample content. |
| `commerceService.getProductOffers` | Product detail already returns offers per variant and stock; the detail UI uses that aggregate. |
| `commerceService.getOrderFulfillment/getOrderShipment/listRefunds/getRefund` | Order detail carries fulfillment/refunds and uses shipment tracking where available. A separate generic wrapper is not proof a user journey is missing. Verify partial-pagination semantics before retiring a wrapper. |
| `commerceService.getFinancingIntent` | The checkout financing flow reads server checkout/ops and its actual intent status. Never fabricate financing approval. |
| `adminSubscriptionService.getPlan` | Plan list DTO already includes the plan's prices and entitlements. Maintenance writes use the dedicated endpoints. |
| `adminSubscriptionService.listBillingAttempts` | Household subscription detail includes its attempts. A cross-household billing explorer is a separate UI scope, not a missing backend endpoint. |
| `sellerOsService.getOffer` | Offers list returns the full Seller OS DTO; editing and inventory use the selected row. |
| `travelService.listRequirements` | Trip detail/readiness already renders requirement DTOs and linked evidence from the trip/readiness data. Do not create a second checklist. |
| `vetPanelService.getVitalsTrends/listProblems/listAlerts` | Patient aggregate includes vitals history/problems/alerts. Clinical writes use dedicated methods and explicit patient access. |
| `providerClinicalService.listVisits` | Patient record shows recent visits. Full historical pagination must be reviewed separately; recent visits are not a complete-history claim. |
| `adminContentService.listPlacements` | Placement editor selects a typed placement key and calls `getPlacement`; a second list is not required for those existing destinations. |
| `insuranceService.getApplication` | Pet insurance list displays actual application status. A detailed standalone application page is not claimed by this release. |

| `accountService.activity` | Existing account activity page already has filters and cursor pagination. Its query-dependent suffix previously escaped the exact-path scan; do not build a second activity page. |
| Household activity endpoint | Household center already renders access history from its authorized collaboration aggregate. A larger standalone activity explorer is a separate product scope. |
| `adminTravelExternalService.probe` | `health-check` is a controller alias for the same probe service. The health-check control is the UI; do not add duplicate buttons to increase coverage counts. |

These are functional equivalences to review, not evidence that every variant of every endpoint was exercised live.

## Operations still requiring product/frontend work

The following have existing backend contracts. **They must not be handed back as requests to implement an API that already exists.** They are not marked complete just because a shared visual pattern now applies:

- **Implemented:** insurer staff directory/grant/revoke, provider and product catalog maintenance, role-dependent entry points and explicit confirmations (`f27327d`).
- **Implemented:** paginated marketplace statement browsing and detail, actual amounts/currency/fee confidence (`f27327d`). Per-reconciliation-result detail remains a separate review candidate.
- Content version inspection is now implemented with `getVersion`, a rendered server snapshot, and visible restore/inspection failures.
- Global billing-attempt exploration if required beyond the household-scoped screen.
- Remaining unmatched controller groups, including administrative settings/partner tooling and remaining specialist operations. Clinic OS now includes team/branches, CSV import/export, reminders, campaigns and owner-only finance; health-depth includes feed, temporary record links and care suggestions. Access management, external travel browsing/planning, source operations, listing inspection, duplicate review and diagnostic reports have also been implemented in this continuation. Some are protected-lane work; some are real frontend gaps; some are internal or have replacement UI. The endpoint/source/line list in `backend-ui-coverage.json` is the work queue. No automatic match means **review**, not automatically “missing API” or “safe public button”.
- `commerceService.updateCheckout`, `providerOsService.complete` and `adminCommerceService.executeRefundApproval`: compare semantics with the currently used checkout/transition/refund actions before adding duplicate mutations. Refund execution remains permission-controlled and audited.
- Public tags/placements and insurer provider details: optional browsing entry points need a product decision and real content; do not add blank pages to satisfy a method counter.

## Chat contract limitation

`chatService.open` needs a participant user ID. Public `CommunityPostDto.authorUserId` is intentionally null for other people's posts (privacy contract); only the viewer's own content exposes it. Do not undo this privacy protection or ask a user to paste an internal UUID. If starting chat from a public post is required, the backend must expose a content-reference action that resolves the recipient server-side, applies blocking/abuse/rate rules and returns an authorized conversation ID. The current chat inbox/message UI remains functional for existing conversations. `unreadCount` is not yet a global badge in the member navigation.

## Evidence and remaining certification

`BACKEND-COVERAGE.md` groups all endpoint declarations. `backend-ui-coverage.json` retains per-endpoint evidence and direct UI file references. `ui-coverage-audit.json` records exported wrappers and their consumers. `route-design-status.json` distinguishes shared styling from individual browser verification. Tests and controlled browser captures are necessary evidence; they do not replace authenticated live integration checks after legitimate Prisma generation.

This rollout completes the approved **shared page patterns and the listed feature additions**. It does **not** certify universal UI/API coverage, redesign the protected admin navigation/CRM/customer-affairs, or authorize production deployment with a failing repository-wide check.
