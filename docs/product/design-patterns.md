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
