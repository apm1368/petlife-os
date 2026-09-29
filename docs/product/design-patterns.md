# PET LIFE OS Design Patterns

Canonical product patterns established by Batch 1. These rules extend the existing PET LIFE visual system; they do not replace it.

## AUTH / FORM PATTERN

### Anatomy
- Focused auth shell with one primary method, one clear next action, and secondary methods disclosed below it.
- Persistent label, optional description, input, inline validation, recovery link, submit state, and legal footer.
- Password fields support visibility controls and confirmation. OTP supports countdown, resend, and changing the identifier.
- Errors use safe, user-facing copy and never disclose whether an account exists.

### States
Default, focus, validating, loading, success, generic error, expired, rate-limited, disabled, network failure, and session-expired.

### Responsive
The split cinematic shell may collapse to one column below tablet width. The form remains a readable single column with full-width primary action.

### RTL / LTR
Persian is canonical RTL. Labels, field affordances, progress, and recovery links follow logical direction. English mirrors structure in LTR rather than merely changing text alignment.

### Reuse
Use for sign-in, registration, recovery, verification, account linking, and other identity-sensitive forms. Preserve sanitized same-origin `returnTo`.

## ACCOUNT PATTERN

### Anatomy
- One account shell with section navigation and a focused content column.
- Sections: Overview, Personal, Security, Privacy, Household, Notifications, and Activity.
- Overview answers identity, household, pets, membership, and attention without becoming another dashboard.
- Page header contains eyebrow, title, concise explanation, and at most one primary action.

### States
Skeleton, useful empty state, retryable error, forbidden/not-found, success notice, disabled action, unsaved changes, and confirmation.

### Responsive
Desktop uses stable section navigation plus content. Mobile uses horizontally scrollable section navigation and never squeezes a desktop sidebar.

### RTL / LTR
Active indicators and navigation order use logical inline edges. Date, phone, and technical values retain readable bidi isolation.

### Reuse
Use this shell for consumer account settings only. Domain management remains in its own vertical and is linked rather than duplicated.

## SECURITY PATTERN

### Anatomy
- Consumer-readable rows for sign-in method, connected provider, session/device, and security event.
- Row content: icon, primary label, safe context, time/state, and a scoped action.
- Current session is explicitly labelled. Device names are derived only from real user-agent data.

### States
Connected, verified, current, active, revoked, expired, empty, loading, error, and destructive confirmation.

### Responsive
Rows wrap actions below content at narrow widths while preserving the current-session label and tap target size.

### RTL / LTR
Time and browser strings render safely in both directions. Destructive actions remain visually distinct without reversing meaning.

### Reuse
Use for account sessions and connected login methods. The same visual grammar may be reused for provider/seller team security, not its domain authorization model.

## HOUSEHOLD PATTERN

### Anatomy
- Household selector when multiple memberships exist.
- Organizer and member rows show only name, role, join context, and pet-access summary.
- Invitations have masked destination, status, expiry, resend, and cancel.
- Pet cards lead to access and lifecycle management.

### States
No household, single/multiple households, pending invitation, delivered, blocked external delivery, expired, cancelled, accepted, loading, forbidden, and retry.

### Responsive
Lists replace wide matrices. On mobile the hierarchy is household → member/pet → details.

### RTL / LTR
Role/status placement and chevrons use logical flow. Masked contacts and dates remain readable.

### Reuse
Household is the collaboration boundary. Every person keeps their own account; membership never implies full pet access.

## PERMISSION PATTERN

### Anatomy
- Human-readable presets: View only, Care helper, Full household access.
- Explicit capability chips/controls reveal the underlying real permissions.
- Target, pet, start, expiry, and reason are visible before confirmation.
- Effective access and expiry are shown without exposing health content.

### States
Active, scheduled, expiring, expired, revoked, no access, unauthorized escalation, and owner-protected.

### Responsive
Use stacked member/pet cards and grouped capabilities on mobile; compact structured lists are acceptable on desktop. Do not use a giant matrix.

### RTL / LTR
Permission groups keep semantic order across directions. Dates and switch labels stay associated.

### Reuse
Share the interaction grammar with future Provider Team, Seller Team, and Admin profiles; never reuse PetAccessGrant as those domains' authorization model.

## CONFIRMATION PATTERN

### Anatomy
- Normal confirmation: title, effect, confirm/cancel.
- High-impact action: impact summary and explicit affected resource.
- Destructive action: retention/consequence explanation and typed confirmation where warranted.
- Sensitive lifecycle action: empathetic copy, downstream effects, and a deliberate confirmation.

### States
Ready, validating, processing, success, recoverable failure, and irreversible/completed.

### Responsive
Dialogs fit narrow screens, keep actions reachable, and preserve focus trapping and labelled controls.

### RTL / LTR
Action order follows the locale's reading model while the safer cancel path remains obvious.

### Reuse
Do not make every confirmation red. Reserve destructive styling for revocation, deletion, and irreversible lifecycle changes.

## PET DETAIL PATTERN — Batch 2

### Layout anatomy
Persistent pet identity header (photo, name, species, breed, sex, age, recorded weight, microchip), lifecycle strip, permission-aware section navigation, then one focused content area. Overview order: Needs Attention → Upcoming → Recent Health → Recent Activity → Recent Memory → shortcuts. Data comes from the bounded `GET /pets/:id/overview` read model, not ten client fetches.

### Navigation
Overview, Health, Care, Documents, Memories, Activity, Travel. Clinical and care detail pages keep the pet header and a back link to their list. LOST links into the existing Lost Pet flow; it is never duplicated here.

### Components
`PetContextShell`, `PetProfileView`, `Avatar`, `StatusLabel`, `ContextSurface`, `EmptyState`, `ErrorRecovery`, `Skeleton`.

### Statuses
Lifecycle: ACTIVE, LOST (urgent context, no public medical data), TEMPORARILY_TRANSFERRED (current care/access context), DECEASED and MEMORIAL (memories first, no routine care or booking promotion, history stays readable). Attention severity: INFORMATIONAL, ATTENTION, CONCERN, URGENT, EMERGENCY. Data quality is separate: UNKNOWN, INCOMPLETE, KNOWN_NEGATIVE — none of them render as "healthy".

### Empty / loading / error
Bounded skeleton; forbidden and not-found show recovery, never an endless skeleton; missing age, breed or clinical data use explicit "not recorded" copy.

### Responsive
The header wraps; section navigation scrolls horizontally on its own; content is single-column below `md`. Nothing is squeezed from desktop at 360/390px.

### RTL (fa)
Logical properties (`ps`/`pe`, `border-s`) mirror the layout; back chevrons point to the inline start; dates use the Persian calendar; Latin drug and test names are isolated with `dir="auto"`.

### LTR (en)
Same structure mirrored, Gregorian dates, no text-align-only adaptation.

### Reuse rules
Use for every pet-owned domain (Memories, Travel, Lost Pet, Insurance, admin pet context), not for account settings. Access flags decide visible navigation, and server guards independently decide access. A scoped veterinarian share never grants this shell.

## HEALTH RECORD PATTERN — Batch 2

### Layout anatomy
Back to list → record type, title and status → provenance and date metadata → readable clinical sections → linked entities (visit, referral, documents) → correction and revision history where supported. Every type belongs to one Health Home; `/health/advanced` redirects there.

### Navigation
Canonical `/pets/:id/health/<type>/:recordId`. Lists and the health timeline link each entry to its detail page. Rehab sessions have no standalone page and are reached through their plan. Vaccination is one recorded summary per pet — no invented vaccination event IDs. Clinical nutrition plans stay distinct from owner feeding notes.

### Components
`HealthRecordDetailView`, `BasicHealthRecordDetailView`, `ClinicalVisitDetailView`, `HealthDocumentDetailView`, `ObservationDetailView`, `HealthTimelineView`, `VetShareView`.

### Statuses and provenance
Provider Record, Owner Observation, Owner Correction and Provider Revision are four distinct labels and are never flattened. Lab flags appear only when the source recorded them. Unknown, incomplete, recorded, revised and voided are distinct states.

### Empty / loading / error
"No recorded X" rather than "no X". Failed clinical loads show an error, never fabricated zero counts. Reading history never requires a premium plan.

### Documents
Metadata loads through authorization; the short-lived signed URL is requested separately and never persisted. Storage object keys never reach UI payloads. Preview supports PDF and allow-listed raster images and falls back to opening the file. Revocation stops new links from being issued; a link already issued stays valid until its storage TTL expires, and the UI does not claim otherwise.

### Share With Vet
Owner flow: choose a verified veterinarian, scopes (conditions, allergies, current medications, vaccination summary, selected documents, clinical visits) and an expiry of at most 90 days → preview of exactly those records → confirm → issued list showing provider, scope and the from–until window → revoke. Recipient flow: `/provider/shared-records` lists only active shares; the detail page shows only the granted sections and signed downloads for the selected documents. An expired or revoked share shows an explicit "no longer active" state.

### Responsive / RTL / LTR
Max-width reading column; metadata wraps; bounded preview; bidi-safe titles; logical leading borders; Jalali dates in fa and Gregorian in en.

### Reuse rules
Reuse in the provider patient view. Reminder completion never writes clinical facts. Scoped shares are read through their scope-enforcing API, never through the broad health permission union.

## CARE / SCHEDULING PATTERN — Batch 2

### Layout anatomy
Pet context → title with Calendar link and Create action → state filters (Due soon, Overdue, Upcoming, Completed, Snoozed, Cancelled, Custom) → care rows. Each row shows pet, type, due time, source, recurrence, status, original due date when adjusted, notification state (sent time or not yet sent), and a link to the related record. Daily-care instructions are a secondary disclosure.

### Navigation
`/pets/:id/care` → `/pets/:id/care/:careItemId` (event detail with all actions) and `/pets/:id/care/calendar`. Notifications deep-link to the exact care item.

### Components
`CareCenterView`, `ReminderForm`, `PetCareCalendarView`, `care-calendar-date`, `CareReminderService`, `CareReminderWorker`, `CareSourceListener`.

### Statuses and actions
States: UPCOMING, DUE (within 24 hours), OVERDUE, COMPLETED, SNOOZED, CANCELLED. Missed care never auto-completes. Actions: create, edit (user-created only), complete (audited; creates exactly one next occurrence for the chosen recurrence; no clinical record), snooze (later today — up to 3 hours, capped at 22:00 Tehran; tomorrow 09:00 Tehran; or a custom time), reschedule, cancel. Snooze changes only the wake time; `originalDueAt` is always kept. Provider- and record-derived items cannot be edited; rescheduling them never changes the source record.

### Sources
USER_CREATED (owner), PROVIDER_CREATED (care plan item), MEDICAL_RECORD_DERIVED (recorded vaccination due date), BOOKING_DERIVED, SYSTEM_SCHEDULED. Projection uses only recorded dates. When a source date changes, the open projection is cancelled and replaced; history is kept.

### Notifications
H10 delivery with stable event IDs: one DUE notification inside the 24-hour window and one OVERDUE notification after the due time. Snoozed, closed or inaccessible items are skipped. SMS respects preferences and quiet hours; no new channels.

### Empty / loading / error
Explicit no-items copy per filter or date; retryable errors; a failed mutation keeps the form; busy state prevents double submission.

### Responsive
Desktop has Month and Agenda views. At 360/390px: a day selector plus agenda list — never the squeezed month grid.

### RTL (fa)
Persian month boundaries and Saturday-first weekdays; times shown in Tehran time; stored in UTC.

### LTR (en)
Gregorian months, Sunday-first weekdays, same UTC source.

### Reuse rules
Provider calendar, booking availability and recurring commerce reuse the row, status and agenda grammar, not the care domain model. Never invent clinical schedules. Monthly and yearly recurrence is Gregorian with month-end clamping, and the form says so.

## DISCOVERY PATTERN — Batch 3

### Layout anatomy
Compact hero with one search field → filter strip (city, sort, date, max price as selects; species, home visit, rating, specialty, near-me as toggle pills) → result count with a one-line ranking explanation → result grid → footnote on unavailable map view.

### Navigation
`/services` (category tiles + free-text search) → `/services/:category` or `/services/search?q=` or `/vet/find` → `/providers/:id`. Every filter is a URL parameter, so back/forward, sharing and sign-in return keep the exact search.

### Components
`ProviderDiscoveryView`, result card (cover, verified badge, rating or "no reviews yet", name, type, top services, area + distance, next availability or "no opening in 7 days", pet types, completed count, starting price, save heart).

### Statuses
Verified only. Rating shown only when reviews exist. Next availability is a real slot or an explicit "none". Price "from" only when a price exists; otherwise "on request".

### Empty / loading / error
Six-card skeleton; empty state offers "clear filters"; error offers retry. Geolocation denial explains and suggests a city.

### Responsive
One column → two (md) → three (lg). Filters wrap; pills scroll horizontally on narrow screens.

### RTL / LTR
Logical properties throughout; the heart sits at the inline end; Persian digits via `toLocaleString`; dates in Jalali (fa) and Gregorian (en).

### Reuse rules
Reuse for any marketplace list (travel listings, places). Never show a signal the data does not have. Never rank by payment.

## PUBLIC ENTITY DETAIL PATTERN — Batch 3

### Layout anatomy
Cover (optional) → identity block (logo, type, name, verification sentence, rating sentence, completed count) → section anchors → About/specialties/gallery → Services with options and terms → Team → Location and contact → Reviews (verified-only note) → Policies → FAQ. One primary action, "Book": inline on desktop, sticky bottom bar (safe-area aware) on mobile.

### Components
`ProviderProfileView`; each service row links straight into the booking flow with the service preselected.

### Statuses
Unverified or deactivated providers return "not available" (404), never a partial page.

### Empty / loading / error
Distinct states for loading, not-found and error, each with retry where meaningful; sections without data say so or are omitted (Team, Policies, FAQ).

### Responsive / RTL / LTR
Single reading column, max-w-5xl; anchors scroll horizontally; the sticky CTA appears below `lg`.

### Reuse rules
Reuse for sellers, places and insurance providers. Trust copy must describe what was verified, not imply more.

## BOOKING / TRANSACTION PATTERN — Batch 3

### Layout anatomy
Back to provider → title → numbered step indicator (Service, Pet, Time, Details, Review) → step body → sticky footer with Back and one primary action whose label names the real outcome ("Hold this time", "Send request", "Book and go to payment", "Confirm booking").

### Rules
- Anonymous visitors browse services and availability. Sign-in is required at the hold, with returnTo keeping service, option and date.
- The hold is bounded and visible (countdown). On expiry the flow returns to Time with an explanation.
- The review step lists every frozen term: price × pets, payment mode and deposit, booking mode, cancellation terms, preparation and the shared health scope.
- The server decides the outcome state; the UI never assumes success.
- Errors map to human copy per code (slot taken, hold expired, pet not supported, profile incomplete, forbidden, rate-limited).

### Detail page (after booking)
Status + payment chips + booking number → state banner (requested deadline, pay-by, declined reason, expired, moved) → terms list → shared data → timeline (status, actor, time) → only the actions the state allows. Cancel confirms with the policy refund preview; reschedule keeps the original until the new time is secured.

### Responsive / RTL / LTR
Single column max-w-3xl. The footer is sticky with a safe-area inset. Times always show in the provider timezone.

### Reuse rules
Checkout (Batch 4) and travel booking reuse the step indicator, hold countdown, frozen-terms review and outcome-named primary action.

## OPERATIONAL CALENDAR PATTERN — Batch 3

### Layout anatomy
Title + staff filter + "Block time" → view switch (Day/Week/Month) + period navigation + Today → grid (desktop) or agenda (mobile) → block-time dialog.

### Entries
Time, pet, service, status label (text, not colour alone) with a status-coloured inline-start border; opens the booking. Blocked periods render as neutral bars with the staff name. The month view shows counts and a "request pending" flag, and a day click opens the Day view.

### Rules
Weeks start Saturday (fa) or Monday (en). Day keys are computed in the location timezone. Closed bookings are hidden. Blocking time never cancels existing bookings.

### Reuse rules
Seller fulfilment scheduling and admin operations reuse the grid/agenda split and status grammar, not the booking model.

## COMMERCE DISCOVERY PATTERN — Batch 4

### Layout anatomy
Shop home: hero with one search field → real top-level categories (+ repeat delivery tile) → current promotions (only when live) → recommended products. Results: title → search → category chips (children of the current category) → sidebar filters (desktop) / filter sheet (mobile) → result count + sort → product grid → pagination.

### Components
`ProductCard` (image or neutral tile, brand, title, variant, verified rating only when reviews exist, the price the customer pays with a real-promotion strike-through, stock badge, pet compatibility), `ProductResultsView`, `PriceBlock`, `StockBadge`, `RatingInline`.

### Rules
Every filter lives in the URL. Customers enter Toman; the API filters in IRR. Products without a buyable offer are not listed. No preview/demo products, no invented delivery promises, no "best seller" language without data. Recommended ranking is explainable (see commerce research).

### Empty / loading / error
Eight-card skeleton; empty state with "clear filters" when filters or a search are active; retry on error.

### Responsive / RTL / LTR
2 → 3 → 4 columns. Below `lg` the filters open in a bottom sheet with a "show N products" action. Persian digits through ICU `{count, number}` / `toLocaleString`.

### Reuse rules
Reuse for any catalogue list (places, travel products). Never show a signal the data does not have.

## PRODUCT DETAIL PATTERN — Batch 4

### Layout anatomy
Breadcrumb → gallery (variant media first) | identity (brand, title, rating link, favorite) → compatibility (always above the CTA) → variant selector → offer list (seller + verification, price block, stock, repeat availability) → quantity (capped by stock and 20) → add to cart (sticky bar on mobile) → repeat-delivery card → about / suitability / specifications → verified reviews (paged) → related products.

### Rules
The default offer is the server's deterministic choice; the customer can pick any other offer. Out-of-stock variants and offers stay visible but cannot be added. Repeat delivery states plainly that nothing is charged automatically.

### Empty / loading / error
Not found (removed or inactive) is its own state with a way back to the shop. Missing sections are omitted, never filled with placeholders.

### Reuse rules
Reuse for any single purchasable entity; keep compatibility above the primary action.

## CART / CHECKOUT PATTERN — Batch 4

### Cart
Grouped by seller ("Sold by …"). Each line shows the live price, the real discount, and issues as labels: unavailable, seller unavailable, out of stock, only N left, price changed, promotion ended. Changed prices are accepted explicitly ("Accept current prices"). Blocking issues disable checkout with a one-line reason. Summary: items (gross) → promotions → delivery "calculated at checkout" → subtotal.

### Checkout
Reuses the Booking/Transaction step grammar: address (household address book, default preselected, postal code validated, add-new inline) → review (frozen lines, subtotal, promotions, delivery, total) → per-seller real shipping quotes → payment method → payment/financing → outcome. The amount charged is exactly what the review showed; orders are created from those frozen lines.

### Responsive / RTL / LTR
Cart summary is a sticky side column on desktop and follows the lines on mobile. Numbers use locale digits.

## ORDER DETAIL PATTERN — Batch 4

### Layout anatomy
Order number + seller + placed time + status → notice line after an action → available actions card (cancel before dispatch, or refund request after delivery / failed delivery) → items (snapshot title, variant, quantity × unit price, promotion, target pet, review action) → totals (subtotal, promotions, delivery, total) → payment/financing status → fulfillment status + tracking milestones → order history (status events) → refund requests and refunds → shipping address → payment details link → support.

### Rules
Actions come from server flags (`canCancel`, `canRequestRefund`), never from client guesses. Cancel explains the full refund amount before confirming. A refund request says it will be reviewed; nothing implies an instant refund. One review per delivered item. My Orders groups orders into In progress / Delivered / Cancelled & refunded.

### Reuse rules
Booking detail and any future transaction detail use the same order: identity → state → allowed actions → terms → history.

## SELLER OPERATIONAL PATTERN — Batch 4

### Rules
Seller screens show what the seller must do next: the order detail has a "next step" card (mark packed → request courier), and a cancel action that always refunds the customer and returns stock. Cancelled orders carry a "do not ship" banner. Refund requests are visible to the seller but decided by PET LIFE. Offers carry repeat-delivery settings (interval chips; at least one required). Promotions are seller-funded and limited by the API to the seller's own products.

### Reuse rules
Provider operations follow the same "next step first" layout.

## ADMIN COMMERCE PATTERN — Batch 4

### Layout anatomy
Section nav (overview, orders, refund requests, products, reviews, inventory, sellers, promotions) → filter bar → table with a horizontal scroller (the page never scrolls sideways) → pager. Mutations open a dialog that asks for a reason where it is audited.

### Rules
Read access `commerce.view`; moderation `commerce.manage`; promotions `promotions.manage`; refund-request decisions `finance.refund.request`. Approving a refund request only opens the two-person finance approval; money moves at execute. Customer PII is limited to first name and city. Every mutation writes the admin audit log. Analytics exclude cancelled and refunded orders and say so.

## TRAVEL DISCOVERY PATTERN — Batch 5

### Anatomy
Search form (destination with real destination suggestions, Jalali/Gregorian date range field, pets — own pets when signed in, anonymous species/count/weight otherwise) → results header with the query summary → filters (sidebar ≥ lg, sheet below) → sort (with a sentence explaining “best pet match”) → list/map toggle → result cards (cover, type, city, verified, rating with count, stated pet rules line, match status, whole-stay total or nightly “from”, booking mode, compare checkbox, favorite) → compare tray.

### States
Loading skeleton cards; no dates (note inviting dates, nightly prices only); empty (explains that full or conflicting stays are hidden, offers clearing filters); error with retry; map selected but unavailable (explicit message, list stays); stale remembered pet (forgotten, anonymous retry).

### Responsive
Filters move into a bottom sheet under lg; cards stack image-over-text below sm; compare tray is a sticky pill.

### RTL / LTR
Layout mirrors via logical properties; Persian digits and Jalali month names in fa; prices always in Toman via `formatCurrency`.

### Reuse
`TravelSearchForm`, `TravelResultCard`, `DateRangeField`; the URL is the state except private pet ids (localStorage).

## TRAVEL LISTING DETAIL PATTERN — Batch 5

### Anatomy
Breadcrumb → gallery (single image spans full width; lightbox with counter) → title, type, city, verified, rating → pet rules table (“Not specified” for unknowns + disclaimer) → about, check-in/out times, house rules, amenities → rooms with rate plans in plain language → verified reviews with host responses → nearby places and vets → booking panel (dates with real unavailable nights disabled, pets, match with reasons, price breakdown, reserve).

### States
Not found (unpublished), error, no bookable room, quote error (rate not offered for dates), night unavailable, conflict (reserve disabled), guest (sign in to reserve, returnTo keeps dates/room/rate).

### Responsive
Booking panel is a sticky aside ≥ lg; below lg it sits after the content with a fixed bottom bar showing the total and a “Reserve” jump.

### RTL / LTR
Gallery and tables mirror; the price breakdown uses tabular figures.

### Reuse
`PriceBreakdown`, `policyFacts`, `matchReason`, `cancellationSummary`.

## TRAVEL BOOKING PATTERN — Batch 5

### Anatomy
Stay summary (cover, listing, room, rate, dates, reference) → hold countdown → steps: pets & rules (acknowledgement when information is missing) → add to trip (optional) → final review (frozen breakdown and terms, message to host, privacy note) → payment (window countdown, gateway note) → result.

### States
Hold running / under 3 minutes (attention tone) / expired (dates released, back to the stay); request-to-book copy (nothing charged until accepted); payment failed (nothing charged, retry with a new idempotency key); payment pending; window closed; confirmed; request sent.

### Responsive
Single column; step chips scroll horizontally on phones.

### RTL / LTR
Countdown digits localised; reference rendered `dir=ltr` and non-breaking.

### Reuse
`TravelBookingFlowView`; server decides the outcome of every step.

## TRIP HUB PATTERN — Batch 5

### Anatomy
My Trips (upcoming/past tabs; trips, then stays not in a trip) → Trip Hub: phase, dates, travel mode → stays → readiness → recent activity → aside with insurance, destination places (favorites first), vets, travel documents, support.

### States
Planning/upcoming/in progress/completed/cancelled phases; no stays; no requirements; loading, not found (other household), error.

### Responsive
Aside drops below content under lg.

### RTL / LTR
Activity labels are localised from structured codes (booking status, requirement type/status, insurance status).

### Reuse
`MyTripsView`, `TripHubView`; the existing pet trip editor remains the place to edit requirements.

## TRAVEL READINESS PATTERN — Batch 5

### Anatomy
Each requirement shows type, status, evidence state (found/missing/expiring/expired), source, jurisdiction, verification date, official link and linked document; a stale banner when any row needs re-checking; library suggestions with source and date that are added as REQUIRED.

### States
Unknown rows show a single “Unknown” tag (no duplicated evidence tag); stale rows flagged; nothing ever turns ready automatically.

### Responsive
Rows stack; tags wrap.

### RTL / LTR
Dates are Jalali in fa.

### Reuse
`documentStates` from the hub API; `requirementStatusTone`.

## INSURANCE COMPARISON PATTERN — Batch 5

### Anatomy
Product and compare pages show coverage, limits, waiting period and exclusions at equal prominence; the pet's applications show status, eligibility, insurer message, reference and history; submission requires ticking a consent that states what is shared and that it is not a policy.

### States
Draft (consent + submit/cancel), submitted/under review (cancel, disclaimer), needs information (insurer message, notes, resubmit with consent), approved (explained as insurer acceptance), declined (message), cancelled.

### Responsive
Single column cards.

### RTL / LTR
The recorded consent text is shown verbatim (LTR) under the Persian translation.

### Reuse
`PetInsuranceView`, insurer portal `InsurerApplicationView` mirrors the server's insurer transitions.

## MAP / PLACES PATTERN — Batch 5

### Anatomy
Place detail: category, verification, address, description, indoor/outdoor, pet facts (leash, water, pet area — yes/no/not specified), opening hours or “not specified”, verified date, favorite, link to stays in the same city, report form (reason + details).

### States
Report sent, already reported, sign-in required, failure; unverified place warning.

### Responsive
Map views degrade to lists with distances (PostGIS) until a map provider exists.

### RTL / LTR
Weekday names localised; hours rendered LTR.

### Reuse
`PlaceDetailView`, admin `AdminPlacesView`.

## TRAVEL PROVIDER OPERATIONAL PATTERN — Batch 5

### Anatomy
Partner sub-nav (listings, bookings, reviews, finance) → listing editor tabs (details, pet policy, rooms & rates, photos, calendar) with submit/withdraw and the PET LIFE review note → bookings list with status filter → booking detail (pet names and species only, guest message, terms, shared documents via signed links, accept/decline with reason, check-in, no-show, complete, cancel with full refund) → reviews with one response → finance (real figures only, payouts not automated).

### States
Owner-only actions return a clear message for other roles; submission blocked until a pet policy and an active room exist; calendar shows blocked/full/remaining per night.

### Responsive
Tabs and filters scroll horizontally on phones; the calendar grid collapses from 7 to 2 columns.

### RTL / LTR
Free-text inputs use `dir=auto`; money entered in Toman and stored in IRR.

### Reuse
`ProviderTravelViews`; `DateRangeField` for blackout ranges.

## ADMIN TRAVEL PATTERN — Batch 5

### Anatomy
Travel sub-nav (listings, bookings, reviews, requirement library, partners, analytics) → moderation queue defaulting to pending review, with completeness hints → listing detail (approve, request correction and suspend need a note; verified badge needs a reason; all audited; history) → read-only booking detail (money, refunds, linked support) → review visibility with audited reason → requirement library editor (source, date, status, staleness) → analytics with real figures → insurance applications (oversight only) → places reports.

### States
Permission-specific empty states (travel.view, travel.manage, travel.requirements.manage, insurance.applications.view, places.view/manage); moderation errors explain missing pet policy or rooms.

### Responsive
Tables scroll inside `TableWrap`; panels stack.

### RTL / LTR
Console kit tokens follow light/dark themes.

### Reuse
`AdminTravelViews`, `console-ui`.
