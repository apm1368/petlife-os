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

## Partner verification implementation

`provider/verification`, seller verification uploads/documents/submit, admin queue/case/transition/document-review/private-download now have dedicated UI. `PATCH /admin/providers/:id/verification` and the seller equivalent are legacy aliases for the same server transition engine; directories now link the evidence case. They intentionally no longer present an unrestricted status selector. No duplicate buttons are needed for the aliases.

## Clinic continuation

Clinic customer tags, open-appointment staff/resource assignment, and the member-facing explicitly shared clinic notes now have functional UI. Tag deletion is owner-only; assignment uses actual bookable staff and active named resources, preserves untouched fields and reports server conflicts. The customer-detail read is used to refresh actual tag assignments; this does not claim every field in its aggregate has a separate screen. The clinic plan catalog/admin assignment group remains a genuine frontend review item; current-plan usage is already visible and no clinic payment flow is fabricated.

## Admin → API → site round-trips (2026-10-18)

Static check on `stabilization/wave-1` `319650b`: every one of the 386 `apiFetch` calls in the web admin services resolves to an existing API route (method and path), including the legacy `PATCH /admin/{providers,sellers}/:id/verification` aliases in `partner-verification.controllers.ts`.

Four flows were exercised end to end against the **real API and an isolated test database**, never the live site, in `apps/api/test/admin-site-roundtrip.e2e-spec.ts`. Each step re-reads the database and the public endpoint the page calls; a 2xx is not taken as proof.

| Flow | Admin edit (role allowed) | View-only role | Public endpoint / page | Result |
| --- | --- | --- | --- | --- |
| Platform announcement | `PUT /admin/settings/platform.announcement` (ADMIN) | OPERATIONS: reads, 403 on edit | `GET /settings/public` → `PlatformAnnouncement` | Shown on a fresh read. A stale `baseVersion` gives 409 `SETTING_CHANGE_CONFLICT`, never a silent overwrite. |
| Blog article | `PUT /admin/content/articles/:id/locales/:locale`, publish/hide | READ_ONLY: reads, 403 on edit | `GET /blog/articles/:slug` → blog article page | **Defect fixed.** EDITOR (`content.edit` without `content.publish`) could rewrite a VISIBLE article's live text. Editing a live locale now needs `content.publish` (403 `LIVE_EDIT_REQUIRES_CONTENT_PUBLISH`). The editor's path is: publisher hides it, editor edits, publisher publishes. A publisher's edit is live at once, with a version. |
| Place | `PATCH /admin/places/:id` (OPERATIONS) | READ_ONLY: reads, 403 on edit | `GET /places/:id` → place page | Rename shown on a fresh read. |
| Product | `PATCH /admin/commerce/products/:id/status` (COMMERCE_OPERATIONS) | FINANCE: reads, 403 on edit | `GET /shop/products/:id` → product page | INACTIVE → 404, ACTIVE → served again. |

Admin article editor (`AdminContentArticleEditorView`), fixed defects:
- Saving the shared fields (category/author/tags) and status changes (publish/hide/archive) used to fail silently, with an unhandled rejection. Both now show an explicit error.
- The save error always said "check the slug". It now names the real cause: live edit needs a publisher, no permission, duplicate slug, or a generic failure.
- Typed text is kept in every case.
- On a live article the button says "Save and update the live article" instead of "Save draft".

The settings, places and product-status admin views already showed save errors and kept the form.

Still open:
- Real-browser rendering (390/1440, fa/en) of these round-trips was not run on the VPS, which has no browser. It needs an isolated web build pointed at the test API.
- The places admin screen has no rename/edit form, although `PATCH /admin/places/:id` exists. That is frontend work, not a new API.
- A publisher's edit of a live article is immediately public. There is no draft-over-published version, which would need a schema change and a product decision.
