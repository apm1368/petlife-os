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
