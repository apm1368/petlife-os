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
