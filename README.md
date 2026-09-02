# PET LIFE OS — Foundation

Coding Handoff 01: Foundation + Auth + Household + Pet Identity + Active Pet +
Onboarding + Basic Home. This is the first production-shaped slice of PET LIFE
OS — it proves **User → Household → Pet Identity → Active Pet → Personalized
Home** end to end, without prematurely building the rest of the product.

Before Handoff 02 began, the core data model went through a **schema
hardening checkpoint** — see
[Schema hardening checkpoint](#schema-hardening-checkpoint) below.

Coding Handoff 02: **Health Basics + Care Profile + Home Context Integration**
— see [Health Basics + Care Profile (Handoff 02)](#health-basics--care-profile-handoff-02)
below. This is deliberately *not* the full Health platform: labs, imaging,
prescriptions, veterinary booking, AI Health, a full medical timeline, and
pharmacy are all still out of scope. What's here is Allergies, Conditions,
Medications, a Vaccination summary, Diet/nutrition basics, and a free-text
Care Profile — with health-permission-aware Home ranking and Pet Profile
teasers, and a product-wide rule that a health fact is always one of **Known
Present / Known Negative / Unknown / Incomplete**, never collapsed to a
boolean.

Coding Handoff 03: **Find a Vet + Vet Booking Basics + Temporary Health
Access + Care Calendar Integration** — see
[Find a Vet + Vet Booking Basics (Handoff 03)](#find-a-vet--vet-booking-basics-handoff-03)
below. This is deliberately *not* the full Vet Clinical OS: no EMR, AI Vet
Scribe, labs/imaging orders, prescriptions, pharmacy, real payment capture,
provider settlements, or a provider-facing dashboard. What's here proves the
full loop — **Pet Context → Vet Discovery → Booking → Permissioned Health
Sharing → Care Calendar** — with a real provider/availability/booking data
model, Redis-backed slot holds, PostgreSQL as the only source of truth for
booking history, and booking-confirmation-time health sharing built entirely
on the existing grant-union `PetAccessGrant` model (a new `TEMPORARY` grant,
never a mutation of the household's own grant).

Coding Handoff 04: **Services Marketplace Basics** — see
[Services Marketplace Basics (Handoff 04)](#services-marketplace-basics-handoff-04)
below. This *extends* Handoff 03's provider/booking engine to six more
categories — Grooming, Training, Walking, Sitting, Boarding, Pet Taxi —
rather than building a second system: the same `ProviderOrganization`/
`ProviderService`/`SlotGeneratorService`/`Booking` model now carries a
`ServiceCategory` and `LocationMode`, a deterministic
`PetServiceCompatibilityService` decides `COMPATIBLE`/`NEEDS_REVIEW`/
`NOT_SUPPORTED`/`UNKNOWN` without ever hiding its reason, temporary Care
access is Care-Profile-only by category (never health data by default),
multi-day Sitting/Boarding bookings reuse the exact same `startAt`/`endAt`
columns as a 30-minute vet slot, and a conservative weekly-recurrence
feature covers Walking/Training/Grooming. Still explicitly out of scope: a
provider-facing dashboard, live GPS/tracking, messaging, payments/payouts,
and provider reviews.

## Architecture

**Monorepo:** pnpm workspaces + Turborepo.

```
apps/
  api/     NestJS modular monolith (REST, PostgreSQL via Prisma, Redis)
  web/     Next.js 14 App Router (React 18, Tailwind, next-intl)
packages/
  ui/              Shared React primitives (Button, Input, OtpInput, Dialog, ...)
  design-tokens/   Semantic CSS variables + typography tokens (light/dark, fa/en)
  types/           Shared enums/DTOs used by both apps (compiled to JS — see below)
  validation/      Shared Zod schemas for frontend-side validation
  config/          Env-loading helper (Zod-validated, fail-fast)
  eslint-config/   Shared flat ESLint config (base / nestjs / nextjs)
  tsconfig/        Shared tsconfig bases (base / nestjs / nextjs)
```

`packages/types` and `packages/config` are **compiled to `dist/` on build**
(`pnpm build` via Turborepo's dependency graph) because `apps/api` runs as
plain Node, and current Node versions try to natively strip TypeScript from
`.ts` files at require-time — which breaks on `enum`. `apps/web` consumes
every workspace package as source via Next's `transpilePackages`, since
webpack/Turbopack handle TS directly.

### Backend (`apps/api`)

Modular monolith, one NestJS module per bounded concern:

- `AuthModule` — OTP request/verify, session issuance, logout
- `UsersModule` — `/me`
- `HouseholdsModule` — household CRUD, membership
- `PetAccessModule` — the permission model (see below)
- `PetsModule` — pet CRUD, Active Pet, photo upload
- `OnboardingModule` — resumable progress (now includes a `HEALTH_BASICS` chapter)
- `PetHealthModule` — Allergies/Conditions/Medications/Vaccination summary +
  `HealthSummaryService` (named `PetHealthModule`, not `HealthModule`, to avoid
  colliding with the unrelated infra health-check module at `src/health/`)
- `NutritionModule` — diet/nutrition basics (`/pets/:petId/nutrition`)
- `CareProfileModule` — free-text behavioral/handling profile (`/pets/:petId/care-profile`)
- `ProvidersModule` — vet discovery, vet profile, `SlotGeneratorService` (deterministic availability projection)
- `ServicesModule` — category-generic discovery (`GET /services/categories`,
  `GET /providers/services`, `GET /provider-services/:serviceId[/availability]`)
  and `PetServiceCompatibilityService` (Handoff 04)
- `AddressesModule` — `CustomerAddress` create/list (Handoff 04)
- `BookingModule` — `BookingHoldService` (Redis holds), `BookingPetAccessService`
  (temporary grants, renamed from `BookingHealthAccessService` in Handoff 04),
  the booking state machine (every category, including multi-day and
  recurring) and its API
- `CareCalendarModule` — the read/display projection over `Booking`
- `HomeModule` — deterministic Home ranking, now also reacting to an upcoming booking of any service category
- `StorageModule` — S3-compatible object storage abstraction (local dev fallback)

Cross-cutting infrastructure lives in `src/common`:

- `PrismaService` / `RedisModule` — data access
- `ApiExceptionFilter` — the one error contract (`{ error: { code, message, details, requestId } }`)
- `SessionAuthGuard`, `HouseholdMemberGuard`, `PetAccessGuard` — every pet/household
  endpoint goes through one of these; there is no ad-hoc authorization in a controller.
- `CsrfMiddleware` / `CsrfGuard` — double-submit cookie CSRF
- `IdempotencyInterceptor` — `Idempotency-Key` support for pet creation and onboarding completion
- `DomainEventsService` — outbox-shaped (`domain_events` table) + in-process dispatch via `EventEmitter2`

**Authorization model.** `HouseholdMember.role` (OWNER/FAMILY) is only a
*preset* applied when a grant is created. The actual source of truth for "can
this user do X to this pet" is `PetAccessGrant` — and a user can hold
**multiple simultaneous, independent grants** for the same pet (e.g. a
standing `HOUSEHOLD` grant plus a 24-hour `TEMPORARY` vet grant); grants never
overwrite one another (there is deliberately no `UNIQUE(petId, userId)`).
Effective authorization is the boolean **union** (OR) of every grant that is
currently active — see [Schema hardening: the grant model](#schema-hardening-the-grant-model)
below for the exact algorithm. This is why `PetAccessGuard` computes a union
via `PetAccessService.getEffectivePermissions()`, never reads a single row,
and never checks `HouseholdMember.role` directly.

**Auth.** Email or phone → OTP → session. `OtpProvider` is an interface;
`DevOtpProvider` (the only implementation right now) logs the code to the
server console instead of sending an SMS/email, with real-looking behavior
(Redis-backed expiry, resend cooldown, attempt limiting). **Swap this for a
real provider before production — see the `TODO(production)` in
`src/modules/auth/otp/otp-provider.interface.ts`.**

**Sessions.** Random session id in Postgres (`sessions` table), HMAC-signed
before it goes in the cookie (`id.signature`) so a tampered cookie is
rejected before ever touching the database. `HttpOnly`, `SameSite=Lax`,
`Secure` in production. A fresh session row is issued on every successful
OTP verification (rotation-on-auth), never reused.

### Frontend (`apps/web`)

- **Locale:** `fa` (default) / `en`, routed as `/fa/...` and `/en/...` via
  `next-intl`'s middleware. `dir="rtl"`/`dir="ltr"` is set once, on
  `<html>` in `app/[locale]/layout.tsx` — no page sets its own direction.
- **Typography:** Vazirmatn (Persian) + Inter (Latin) loaded via
  `next/font/google` (self-hosted at build time, no runtime Google Fonts
  request, no binaries committed). Mixed Persian/Latin runs ("Apoquel 16 mg")
  render correctly because both fonts share the same metrics-safe fallback
  chain in `packages/design-tokens/css/typography.css`.
- **Theme:** `SYSTEM` / `LIGHT` / `DARK`, semantic CSS variables only (never
  a page-specific color) in `packages/design-tokens/css/tokens.css`. A tiny
  inline script in `<head>` applies a stored `LIGHT`/`DARK` choice before
  first paint (no flash); `SYSTEM` falls through to `prefers-color-scheme`.
  Persisted in `localStorage` via `stores/theme-store.ts`.
- **State:** Zustand for client state that must survive navigation without a
  reload — session (`stores/session-store.ts`), active pet + pet list
  (`stores/pet-store.ts`), and the onboarding wizard's in-progress draft
  (`stores/onboarding-store.ts`).
- **API client:** `lib/api/client.ts` — always `credentials: 'include'`,
  attaches the CSRF header on unsafe methods, and transparently primes the
  CSRF cookie and retries once if a fresh browser session's very first
  mutation arrives before any cookie exists.

### Data model

See `apps/api/prisma/schema.prisma` for the source of truth. Summary:

| Model | Purpose |
|---|---|
| `User` | Identity (email/phone, locale, theme preference); DB `CHECK` requires email or phone |
| `Session` | Server-side session backing the cookie |
| `Household` | A home; `HouseholdMember` links users to it with a role preset |
| `Pet` | Identity, species/breed/sex/age, lifecycle status; `deletedAt` prepared for a future archive strategy (unused so far) |
| `PetAccessGrant` | Multiple independent grants per (pet, user); union of active grants = effective authorization (see below) |
| `ActivePetPreference` | Per-user, per-household "which pet is active" — never stored on `Pet` |
| `OnboardingProgress` | One row per user; chapter/step/status + completed steps, for resumability. `householdId`/`petId` are `SET NULL` on delete, never `CASCADE` |
| `UserPetInterest` | Onboarding personalization input to the Home ranking service |
| `DomainEvent` | Outbox-shaped event log (`UserAuthenticated`, `PetCreated`, ...), with `aggregateType`/`aggregateId`/`attemptCount`/`lastError` for a future real relay |

All ids are UUIDs; all timestamps are UTC; weight is `Decimal`, never `float`;
money isn't modeled yet but `@petlife/types` already ships a `Money { amount,
currency }` shape for when it is.

### Schema hardening checkpoint

Before Handoff 02 (Health Basics) began, the core schema went through a
dedicated hardening pass (migration `20260831175417_schema_hardening`,
additive on top of `20260831165629_init` — the initial migration was never
edited or squashed). This section documents what changed and why, since it's
foundational for every domain built on top of it.

#### The grant model {#schema-hardening-the-grant-model}

`PetAccessGrant` replaced the old one-row-per-`(petId, userId)` `PetAccess`
table (existing rows were migrated forward via `INSERT ... SELECT`, not
dropped). A grant is **active** when:

```
revokedAt IS NULL
AND (startsAt  IS NULL OR startsAt  <= now)
AND (expiresAt IS NULL OR expiresAt >  now)
```

Effective permissions for `(petId, userId)` are the boolean OR of every
active grant's flags — implemented in
`PetAccessService.getEffectivePermissions()`:

```
fetch all PetAccessGrant rows for (petId, userId)
keep only the active ones
if none are active → no access (null)
else → OR each of the 9 boolean flags across all active rows
```

`PetAccessGuard` (used by every pet route) calls this once per request:
no active grant at all → `PET_ACCESS_DENIED`; an active grant exists but the
route's required flag (`@RequirePetAccess(...)`) isn't in the union → also
`PET_ACCESS_DENIED`. Revoking access sets `revokedAt`/`revokedByUserId`
rather than deleting the row, so a grant is also an audit record.
`applyHouseholdDefaults()` (run when a pet is created) is idempotent — it
skips a household member who already has an active `HOUSEHOLD`-sourced
grant rather than creating a duplicate.

No API surface for creating `MANUAL`/`TEMPORARY` grants exists yet (no
"invite a sitter" or "grant vet access" endpoint) — this checkpoint only
hardens the model and the enforcement path; issuing non-household grants is
future work.

#### FK `ON DELETE` policy

| Relationship | Policy | Why |
|---|---|---|
| `Session.userId → User` | `CASCADE` | A session is meaningless without its user |
| `HouseholdMember.{householdId,userId} → *` | `CASCADE` | Membership lifecycle is tied to both sides existing |
| `Pet.householdId → Household` | `CASCADE` | Unchanged from Handoff 01; household hard-deletion isn't exposed by any endpoint |
| `PetAccessGrant.{petId,userId} → *` | `CASCADE` | Revocation (not deletion) is how grant history is preserved — see above; a hard pet/user delete removing its grants is acceptable |
| `ActivePetPreference.* → *` | `CASCADE` | A preference referencing a gone pet/household/user is meaningless |
| `UserPetInterest.petId → Pet` | `CASCADE` | `petId` is nullable for user-level interests; a pet-scoped interest doesn't outlive the pet |
| `OnboardingProgress.householdId → Household` | **`SET NULL`** (was unenforced) | Resumability must survive the referenced household disappearing |
| `OnboardingProgress.petId → Pet` | **`SET NULL`** (was `CASCADE`) | Same — losing progress because a pet was deleted would be a real regression |

**Future child domains — health records, bookings, orders, payments, claims,
donations, audit records — must NOT default to `CASCADE` from `Pet`/`User`/
`Household`.** Those need to survive root-entity removal for legal/audit
reasons; each should get a deliberate policy (typically `RESTRICT` or a
`SET NULL` + explicit archival) when it's built, not inherit the pattern
used here for lifecycle/preference data.

`Pet.deletedAt` is schema preparation for an eventual archive flow — no code
sets or filters on it yet except `PetsService.listForHousehold`, which
excludes soft-deleted pets from "My Pets" as a forward-compatible no-op
(nothing has `deletedAt` set today). `lifecycleStatus`
(`ACTIVE`/`LOST`/`DECEASED`/`MEMORIAL`) and `deletedAt` are separate axes:
one is the pet's real-world state, the other is removal from the product.

#### NULL vs UNKNOWN

`Pet.sex` and `Pet.neuteredStatus` are both `nullable` *and* carry an
`UNKNOWN` enum value. This is deliberate, not redundant: `NULL` means "never
answered/not recorded"; `UNKNOWN` means "the owner was asked and explicitly
said they don't know." Health/Care work (Handoff 02+) must preserve the same
three-way distinction (Known Negative / Unknown / Incomplete) rather than
collapsing "never asked" and "asked, don't know" into one value.

#### Constraints Prisma's schema DSL can't express

Three constraints exist only in the migration's raw SQL, not in
`schema.prisma` (documented there via comments, since Prisma has no syntax
for either):

- `users`: `CHECK (email IS NOT NULL OR phone IS NOT NULL)` — backs
  `AuthService`'s application-layer check with real DB integrity.
- `user_pet_interests`: two **partial unique indexes** —
  `UNIQUE(userId, interest) WHERE petId IS NULL` and
  `UNIQUE(userId, petId, interest) WHERE petId IS NOT NULL` — because
  Postgres treats `NULL` as distinct in a plain unique index, so the old
  `UNIQUE(userId, petId, interest)` never actually stopped duplicate
  user-level (no-pet) interest rows.
- `pets`: `UNIQUE(microchipNormalized) WHERE microchipNormalized IS NOT NULL`.
  Raw `microchipNumber` is never validated or rejected; only
  `microchipNormalized` (whitespace/separators stripped, upper-cased — see
  `normalizeMicrochip()` in `pets.service.ts`) participates in the
  uniqueness check, so legacy/imported values that can't be confidently
  normalized are still stored, just without a uniqueness guarantee.

**Known risk:** because none of these three are representable in
`schema.prisma`, a future `prisma migrate dev` schema diff may propose
`DROP INDEX`/`DROP CONSTRAINT` for them (Prisma sees unmanaged drift between
the DB and the datamodel). Review any generated migration touching `users`,
`user_pet_interests`, or `pets` before applying it.

#### Transactional outbox

`DomainEventsService.publish()` now accepts a `{ tx, aggregateType,
aggregateId }` option. Where a domain mutation and its event are logically
one unit — pet creation, household creation, active-pet switching,
onboarding completion — the write and the `domain_events` insert happen in
the same `prisma.$transaction(...)`, so they commit or roll back together.
Dispatch is still synchronous, in-process `EventEmitter2` (no queue), but the
`domain_events` row now carries `eventVersion`, `aggregateType`,
`aggregateId`, `attemptCount`, and `lastError` — the columns a future retry
poller needs — so building that poller later requires no schema change.

### Home ranking (MVP)

`HomeRankingService` (`apps/api/src/modules/home/home-ranking.service.ts`) is
a pure function, deliberately not wired to any ML, and deliberately has no DB
access — `HomeService` does every read (including the permission check) and
hands it a fully-resolved input. See
[Home ranking changes (Handoff 02)](#home-ranking-changes-handoff-02) below
for the current rule chain.

## Health Basics + Care Profile (Handoff 02)

Adds Health Basics (Allergies, Conditions, Medications, a Vaccination
summary), Diet/nutrition basics, and a free-text Care Profile — plus the
Home/Pet-Profile integration that makes them visible where a user already
looks. Explicitly **not** implemented: labs, imaging, prescriptions,
veterinary booking, AI Health, a full medical timeline, or pharmacy — see
[Known limitations](#known-limitations--deliberate-simplifications).

### The core rule: Known Present / Known Negative / Unknown / Incomplete

Every health fact in this system is one of four states, never a boolean:

| State | Meaning | Example |
| --- | --- | --- |
| **Known Present** | The list has at least one row | An allergy to pollen is recorded |
| **Known Negative** | The owner explicitly said "none" | "No known allergies" was answered |
| **Unknown** | The owner explicitly said "I don't know" | Vaccination status set to `UNKNOWN` |
| **Incomplete** | Nobody has answered yet (skipped, or never reached) | The question was left at "Add later" |

`KnowledgeState` (frontend/API-facing) and `HealthAreaKnowledgeState`
(`NONE_KNOWN`/`UNKNOWN`, stored on `HealthProfile` for the list-backed
domains) are how this is represented — **Known Negative and Unknown are
different stored values**, not the same "empty list" collapsed two ways.
`VaccinationStatus` carries the same idea natively: `UNKNOWN` and
`INCOMPLETE` are distinct from each other and from `OVERDUE` — the vaccination
summary service and `HealthSummaryService` never *derive* `OVERDUE` from
missing or unanswered data, only from an explicit stored answer.

### New models

All pet-scoped, `onDelete: Restrict` on the `Pet` relation — deleting a pet
with health/care history attached is a decision, not a side effect:

- **`HealthProfile`** — one row per pet. `status` (`SetupStatus`:
  `NOT_STARTED`/`PARTIAL`/`COMPLETE`) is never client-settable; it's
  recomputed by `HealthProfileService.recomputeStatus()` after every mutation
  to any of the four Health Basics domains (allergies/conditions/medications/
  vaccination). Also carries `allergiesOverallState` /
  `conditionsOverallState` / `medicationsOverallState`
  (`HealthAreaKnowledgeState?`) — the Known-Negative/Unknown answer for a
  domain whose list is still empty.
- **`Allergy`** / **`Condition`** / **`Medication`** — per-row entries with
  their own status/severity vocabularies (`AllergyStatus`/`AllergySeverity`,
  `ConditionStatus`, `MedicationStatus`), provenance (`SourceType`,
  `sourceLabel`), and an audit trail (`recordedByUserId`, `recordedAt`,
  `updatedAt`). `Allergy` also has a per-row `AllergyKnowledgeState`
  (`KNOWN`/`UNKNOWN`) — a *different* concept from `HealthProfile`'s overall
  state: this one is per-item confidence, not "is the list empty".
- **`VaccinationSummary`** — one row per pet, `status: VaccinationStatus`
  (`UP_TO_DATE`/`DUE_SOON`/`OVERDUE`/`UNKNOWN`/`INCOMPLETE`) plus
  `nextDueDate`/`lastKnownDate`. A `PUT`-only resource (always a full
  replace) since there's exactly one summary per pet.
- **`NutritionProfile`** — one row per pet: `dietType`, `currentFoodText`,
  `feedingFrequencyText`, `restrictionsText`, and a `status` that is
  `COMPLETE` only once `dietType` + `currentFoodText` +
  `feedingFrequencyText` are all answered.
- **`CareProfile`** — one row per pet, nine free-text fields (temperament,
  around people/animals, leash behavior, handling sensitivity, feeding/toilet
  routine, separation behavior, special instructions) by design — "readable
  text, not a checkbox wall". `status` is `COMPLETE` only once every field
  is filled, `PARTIAL` if some are, `NOT_STARTED` if none are.

**Provenance.** Every health record carries `sourceType`
(`OWNER`/`PROVIDER`/`IMPORTED_DOCUMENT`/`SYSTEM`), but only `OWNER` is
actually reachable from any endpoint this phase — there is no import or
provider-integration flow yet. **`OWNER`-sourced data is never marked or
treated as verified provider data**; the field exists so a future provider
integration doesn't require a migration.

**`HealthSeverity`** (`NORMAL`/`INFORMATIONAL`/`ATTENTION`/`HIGHER_CONCERN`/
`URGENT`/`EMERGENCY`) is fully defined but only `NORMAL`/`INFORMATIONAL`/
`ATTENTION` are ever assigned by any logic this phase — the vocabulary exists
so a future urgent-finding feature doesn't need a new enum.

### Permissions

`PetAccessFlags` gained `canViewHealth` / `canEditHealth` /
`canViewCareProfile` / `canEditCareProfile`, computed through the exact same
grant-union algorithm as every other flag (see
[Schema hardening: the grant model](#schema-hardening-the-grant-model)) — no
separate authorization path was introduced for health data. `HOUSEHOLD`
grants give `FAMILY` members view access to both but edit access to neither;
`OWNER` gets both view and edit. Every health/care controller is guarded by
`SessionAuthGuard, PetAccessGuard` with `@RequirePetAccess(...)` naming the
exact flag required — there is no health endpoint reachable without an active
grant carrying that flag (see the IDOR tests below).

### `HealthSummaryService`

The one consumer-facing read model for a pet's health (`GET
/pets/:petId/health/summary`) — Home and Pet Profile both consume this, never
raw `Allergy`/`Condition`/`Medication`/`VaccinationSummary` rows. Shape:

```json
{
  "status": "PARTIAL",
  "allergyState": "KNOWN_NEGATIVE",
  "conditionsState": "INCOMPLETE",
  "activeMedicationCount": 1,
  "medicationsState": "KNOWN_PRESENT",
  "vaccinationStatus": "DUE_SOON",
  "nextVaccinationDueAt": "2026-09-14",
  "primaryAttention": {
    "type": "VACCINATION_DUE",
    "severity": "ATTENTION",
    "titleKey": "health.attention.vaccinationDueSoon",
    "action": "VIEW_VACCINATION"
  }
}
```

`primaryAttention` mirrors Home's own priority order (vaccination due, then
setup incomplete) so the Health Overview screen and Home never disagree about
"what matters next"; it's `null` once nothing needs attention.

### API endpoints (Handoff 02 additions)

```
GET    /pets/:petId/health/summary
PATCH  /pets/:petId/health/profile

GET    /pets/:petId/health/allergies
POST   /pets/:petId/health/allergies
PATCH  /pets/:petId/health/allergies/:id
DELETE /pets/:petId/health/allergies/:id

GET    /pets/:petId/health/conditions
POST   /pets/:petId/health/conditions
PATCH  /pets/:petId/health/conditions/:id

GET    /pets/:petId/health/medications
POST   /pets/:petId/health/medications
PATCH  /pets/:petId/health/medications/:id

GET    /pets/:petId/health/vaccination-summary
PUT    /pets/:petId/health/vaccination-summary

GET    /pets/:petId/nutrition
PUT    /pets/:petId/nutrition

GET    /pets/:petId/care-profile
PUT    /pets/:petId/care-profile

GET    /pets/:id/access          (the caller's own effective PetAccessFlags for this pet)
```

### UI screens (Handoff 02 additions)

- **Health Overview** (`/pets/:id/health`) — one hierarchy, not a grid of
  equal metric cards: a single primary-attention block (mirroring
  `HealthSummaryDto.primaryAttention` exactly), then a secondary scannable
  list of allergy/condition/medication/vaccination state.
- **Allergies / Conditions / Medications** (`/pets/:id/health/{allergies,conditions,medications}`)
  — list + inline add, each row showing its provenance (`source: OWNER`).
- **Vaccination Summary** (`/pets/:id/health/vaccination`) — a direct status
  picker (`UP_TO_DATE`/`DUE_SOON`/`OVERDUE`/`UNKNOWN`), never a derived value.
- **Nutrition Basics** (`/pets/:id/health/nutrition`) — diet type + free-text
  current food/feeding frequency.
- **Care Profile** (`/pets/:id/care`) — read-only prose for a
  `canViewCareProfile`-but-not-`canEditCareProfile` caller (no edit button,
  no form ever mounted); the editable form is a separate component
  (`CareProfileForm`) only rendered for an editor.
- **Pet Profile teasers** — a Health Summary teaser (vaccination status) and
  a Care Profile teaser (setup status), each with an "Open Health"/"Open Care
  Profile" action, added to the existing Pet Profile screen without turning
  it into a dashboard; both are fetched only when `petsService.getMyAccess()`
  says the caller can view that data.
- **Onboarding — Health Basics chapter** (after Pet Identity/Basic Profile,
  before Personalization): allergies/conditions/medications each ask
  None known / Yes (inline single-name quick-add, not a full intake form) /
  I don't know / Add later; vaccination and diet get their own native
  status/type pickers plus the same "I don't know"/"Add later" pair. "Add
  later" is stored as `OnboardingStatus.SKIPPED` and leaves the domain
  **Incomplete** — a materially different stored state from an explicit
  "None known"/"I don't know" answer, never the same value.

### Home ranking changes (Handoff 02)

`HomeRankingInput` gained `activePetId` (for building real hrefs — see
below) plus `health: { visible, vaccinationStatus, profileStatus }` and
`care: { visible, profileStatus }`. `HomeService` resolves `visible` from
`PetAccessService.getEffectivePermissions()` *before* deciding whether to
even query `HealthSummaryService`/`CareProfileService` — when the caller
lacks `canViewHealth`/`canViewCareProfile`, the corresponding health/care data
is never fetched, let alone ranked. The rule chain, in order:

1. No active pet → suggest adding one.
2. `health.visible` and vaccination is `DUE_SOON` or `OVERDUE` → primary =
   `VIEW_VACCINATION`.
3. `health.visible` and `health.profileStatus !== COMPLETE` → primary =
   `COMPLETE_HEALTH`.
4. Otherwise (health not visible, or complete and vaccination fine): if
   `care.visible` and `care.profileStatus !== COMPLETE` and the household
   member has the `DAILY_CARE` interest, lead the secondary action with
   `COMPLETE_CARE_PROFILE`.
5. `VET` interest → primary = `FIND_VET`; else primary = `ASK_AI`. The
   care-profile secondary action (if any) rides along either way.

New `HomeActionKind` values: `VIEW_VACCINATION`, `VIEW_MEDICATION` (defined,
not yet wired to a ranking rule), `COMPLETE_CARE_PROFILE`. Every action's
`href` is built from the real active pet id (`/pets/{id}/health/vaccination`,
`/pets/{id}/health`, `/pets/{id}/care`) rather than the Handoff 01
`/pets/active/*` placeholder-redirect pattern — the now-unreachable
`/pets/active/health-setup` placeholder route was removed. `/pets/active`
itself (a client-side redirect to `/pets/{activePetId}`) still exists for any
future top-level "current pet" deep link.

## Find a Vet + Vet Booking Basics (Handoff 03)

Proves the full loop: **Pet Context → Vet Discovery → Booking → Permissioned
Health Sharing → Care Calendar**, plus Home/Pet Profile reacting to an
upcoming appointment. Explicitly **not** implemented: EMR, AI Vet Scribe,
labs/imaging orders, prescriptions, pharmacy, real payment capture, refunds,
provider settlements, provider reviews, advanced geo ranking, recurring
booking, or a provider-facing dashboard — see
[Known limitations](#known-limitations--deliberate-simplifications).

### Provider / availability model

- **`ProviderOrganization`** — a clinic/hospital/independent vet
  (`type`), with a `verificationStatus` (`NOT_STARTED` → … → `VERIFIED` /
  `REJECTED` / `SUSPENDED`). **Only `VERIFIED` providers appear in default
  consumer discovery** (`GET /providers/vets`) — every other status exists
  purely for a future verification workflow.
- **`ProviderLocation`** — one organization can have multiple; each carries
  its own IANA `timezone`, which is authoritative for every booking made
  against it (see [Timezone behavior](#timezone-behavior) below).
- **`ProviderUser`** — a person's membership in a provider organization
  (`OWNER`/`VET`/`STAFF`). **Deliberately not a pet-data permission
  source** — `PetAccessGrant` remains the only source of truth for what a
  provider user can see about a pet; a `ProviderUser` row says nothing about
  pet access on its own.
- **`ProviderService`** — a bookable offering (`GENERAL_VET_VISIT` /
  `VACCINATION` / `FOLLOW_UP` / `CONSULTATION`, extensible), with
  `durationMinutes`, an optional `priceAmount`/`currency`, and
  `supportsDog`/`supportsCat` flags used for species-compatibility checks.
- **`ProviderAvailabilityRule`** — a recurring weekly window
  (`dayOfWeek`, `startLocalTime`/`endLocalTime`, `timezone`), optionally
  scoped to one `providerUserId`/`serviceId` or left generic (`null` =
  applies to any). **No slot is ever its own persisted row** — every slot is
  computed on read by `SlotGeneratorService` projecting these rules (and any
  `ProviderAvailabilityException` — `BLOCKED` or `AVAILABLE_OVERRIDE`) across
  the requested date range, using only `Intl.DateTimeFormat`'s built-in ICU
  timezone/calendar support (no external date library dependency).

### Slot holds (Redis, not authoritative)

`POST /booking-holds` creates a short-lived Redis-only reservation
(`BOOKING_HOLD_TTL_SECONDS`, default **600 seconds / 10 minutes** — long
enough to review and share health data without feeling rushed, short enough
that an abandoned hold doesn't block a popular slot for long) via
`BookingHoldService`. It does two things: stores what the holder was booking
(so `POST /bookings` doesn't have to re-collect it) and takes a short-lived
`SET NX` lock keyed on the exact slot, so a second user can't hold the
identical instant while the first hold is live. **Redis is never
authoritative for booking history** — a hold that expires or is never
confirmed simply vanishes, leaving no record; PostgreSQL's `bookings` table
is the only source of truth once a booking is actually confirmed.

### Booking state machine

`BookingStatus` (`HOLD` / `PENDING_CONFIRMATION` / `CONFIRMED` /
`CHECKED_IN` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED_BY_USER` /
`CANCELLED_BY_PROVIDER` / `NO_SHOW`) and `PaymentStatus` (`NOT_REQUIRED` /
`PENDING` / `AUTHORIZED` / `PAID` / `FAILED` / `REFUND_PENDING` /
`REFUNDED`) are deliberately separate state machines — a booking can be
`CONFIRMED` while payment is still `PENDING`. In this phase:

- A `Booking` row is created **directly at `CONFIRMED`** when a hold is
  confirmed — there is no real payment-authorization gate, so
  `PENDING_CONFIRMATION` is never actually used. `HOLD` is likewise never a
  persisted row's status (see above). `CHECKED_IN`/`IN_PROGRESS`/`COMPLETED`/
  `NO_SHOW`/`CANCELLED_BY_PROVIDER` are part of the vocabulary the
  architecture must support but no endpoint transitions a booking to them
  yet.
- Every booking's `paymentStatus` is always `NOT_REQUIRED` — no payment
  gateway exists this phase; the full vocabulary is there so wiring a real
  one later needs no schema change.
- **Double-booking prevention** is layered: the Redis slot-lock is a
  best-effort first line, `SlotGeneratorService` re-checks the slot is still
  `AVAILABLE` at hold-creation time, and — the actual, unconditional
  guarantee — two **partial unique indexes** on `bookings`
  (`(providerLocationId, providerUserId, startAt)` and
  `(providerLocationId, startAt)` for no-specific-provider-user bookings,
  both `WHERE bookingStatus NOT IN (CANCELLED_BY_USER, CANCELLED_BY_PROVIDER)`)
  make it impossible for the same slot to be confirmed twice even under a
  concurrent race — `BookingsService.confirm()` catches the resulting
  Postgres unique-violation and reports `BOOKING_CONFLICT`. A `CHECK
  (endAt > startAt)` constraint exists on both `bookings` and
  `care_calendar_events`. All three are raw SQL in the migration — Prisma's
  schema DSL can't express partial indexes or multi-column CHECKs.
- **Idempotency**: `POST /bookings` uses the existing `IdempotencyInterceptor`
  (`Idempotency-Key` header) — a retried confirm with the same key replays
  the first response rather than re-executing the handler, so it never
  double-books even though the underlying hold is consumed (deleted) by the
  first successful attempt.

### Temporary health access

At booking confirmation, the caller optionally names a `HealthAccessScopePreset`
(`MINIMAL_VET_CONTEXT` / `HEALTH_BASICS` — the default — /
`SELECTED_HEALTH_DATA`). If the booking has an assigned `providerUserId`,
`BookingHealthAccessService.grantForBooking()`:

1. Creates a brand-new, independent `PetAccessGrant` (`source: TEMPORARY`,
   `reason: "VET_BOOKING"`) for the vet's own user account —
   **never mutates or overwrites the household's own grant**, per the
   grant-union model from the schema-hardening checkpoint. `startsAt` is the
   moment of confirmation; `expiresAt` is the appointment's end time plus
   `BOOKING_HEALTH_ACCESS_BUFFER_HOURS` (default **24 hours**, for a
   same-day follow-up note).
2. Records a `BookingHealthAccess` row linking the booking, the grant, and
   the chosen preset — the explicit audit trail for "why does this grant
   exist", and what lets cancellation find and revoke exactly this grant.

**Health data minimization**: `HEALTH_BASICS` grants `canViewIdentity` +
`canViewHealth` + `canViewCareProfile`, never `canEdit*` and never
`canViewLocation`/`canManageAccess` — matching the spec's recommended
default exactly. `MINIMAL_VET_CONTEXT` grants identity only, no health or
care-profile access at all. **`SELECTED_HEALTH_DATA` is not yet distinct
from `HEALTH_BASICS`** — there is no per-field health-data selection UI or
API this phase (`HealthSummaryService` returns one derived summary, not
addressable per-allergy/per-medication toggles); the preset exists in the
vocabulary and the picker so the UI/API shape doesn't change when granular
selection is built later.

If the booking is cancelled before the appointment, `revokeForBooking()`
soft-revokes that specific grant (`revokedAt`/`revokedByUserId`) — the row
itself is preserved as an audit record, exactly like every other
`PetAccessGrant` revocation. If the booking completes normally, the grant
simply expires on schedule; **there is no cleanup job**, because
`PetAccessService.getEffectivePermissions()` already excludes any
expired-or-revoked grant from the active-grant union at request time — see
the schema-hardening checkpoint's effective-permission algorithm.

### Care Calendar (a projection, not a second source of truth)

`CareCalendarEvent` exists to represent "things happening for this pet in
one shared, generic shape (only `VET_APPOINTMENT` right now)" — but
**`Booking` remains the editable source of truth**. `CareCalendarService`
keeps one event row in sync whenever a booking's schedule or status changes
(`upsertForBooking()` on confirm, `markCancelled()` on cancel) and never
accepts an independent edit. `sourceId` is a plain UUID reference with no FK
— the same precedent as `PetAccessGrant.grantedByUserId` — so a future
calendar source (grooming, boarding, …) is a vocabulary addition to
`CareCalendarEventType`, not a new nullable FK column per source. `titleKey`/
`actionType` are i18n keys and a `HomeActionKind`, not localized copy stored
server-side — the same `labelKey` pattern `HomeActionDto` has used since
Handoff 01.

### Dual calendar behavior

Persian UI shows **Jalali** dates, English UI shows **Gregorian** — both via
the ICU calendars built into `Intl.DateTimeFormat` (`fa-IR-u-ca-persian` /
`en-US-u-ca-gregory`), not a custom conversion algorithm or an extra
dependency (`apps/web/lib/date/appointment-date.ts`). The backend only ever
stores and returns canonical UTC instants (`startAt`/`endAt` as ISO strings)
— no duplicate Jalali date is ever persisted; the calendar choice is a pure
display concern resolved at render time from the active locale.

### Timezone behavior

`Booking.timezone` (copied from the provider location at hold-creation time)
is authoritative for that appointment's displayed time — the UI always
formats an appointment's date/time in the provider's own timezone, labeled
clearly, rather than silently converting to the viewer's local timezone.
This is a deliberate simplification: there is no browser-timezone detection
or "your time vs. their time" dual display this phase — see Known
limitations.

### API endpoints (Handoff 03 additions)

```
GET    /providers/vets                              (city, species, serviceType, verifiedOnly, search)
GET    /providers/vets/:providerId
GET    /providers/vets/:providerId/availability      (locationId, serviceId, from, to, petId?, providerUserId?)

POST   /booking-holds                                (requires canBookCare on the pet)
POST   /bookings                                     (Idempotency-Key supported; requires canBookCare)
GET    /bookings                                     (upcoming, past, petId)
GET    /bookings/:id
POST   /bookings/:id/cancel

GET    /care-calendar                                (petId?)
```

Health/booking IDOR protection reuses the same `PetAccessGuard` as every
other pet endpoint — extended in this handoff to also read `petId` from the
request **body** (`request.body.petId`), not only route params, since
`POST /booking-holds`/`POST /bookings` carry the pet id in their payload
rather than the URL.

### Error codes (Handoff 03 additions)

```
SLOT_UNAVAILABLE        409  the requested slot is no longer AVAILABLE
HOLD_EXPIRED            410  the hold id doesn't exist (expired, already consumed, or never existed)
BOOKING_CONFLICT        409  Postgres rejected a confirm as a duplicate of an already-confirmed slot
PROVIDER_NOT_VERIFIED   400  the provider is not VERIFIED
SERVICE_NOT_AVAILABLE   400  the service exists but isActive is false
PET_NOT_SUPPORTED       400  the service doesn't support the pet's species
BOOKING_NOT_CANCELLABLE 400  the booking is already in a terminal (or already-cancelled) state
```

`PET_ACCESS_DENIED` (introduced in Handoff 01) is reused for every
booking/health authorization denial in this handoff rather than adding a
separate `ACCESS_DENIED` code, to keep one error code per concept across the
whole API.

### UI screens (Handoff 03 additions)

- **Find Vet** (`/vet/find`) — provider cards showing name, verification,
  location, supported services, and next available slot; never a fabricated
  distance when geo data is missing.
- **Vet Profile** (`/vet/[providerId]`) — locations, services (with
  duration), a "Book" action per service.
- **Booking wizard** (`/vet/[providerId]/book`) — one route, three internal
  steps (mirroring the Onboarding wizard's single-route-internal-steps
  pattern): **Slot Picker** (a horizontal date strip + time buttons, not a
  full calendar widget, with loading/empty/retry states), **Review
  Booking** (pet/vet/service/location/date-time/price/payment-placeholder/
  reason), and **Health Sharing** (Who/What/Why/Until-When permission
  language, the three scope presets, editable before confirming).
- **Booking Confirmation** — not a separate screen: `/bookings/[id]` itself
  renders a "confirmed" banner (Calendar added, health access expiry) when
  navigated to with `?confirmed=1` straight from the wizard, then falls
  through to the same full **Booking Detail** view below it.
- **Booking Detail** (`/bookings/[id]`) — status and payment status shown
  *separately*, pet/provider/service/location/time, shared health access
  scope + expiry, Cancel (with an impact-aware confirmation dialog). No
  reschedule this phase.
- **Care Calendar** (`/care-calendar`) — deliberately minimal: a scannable
  list of upcoming events that link back to the real Booking Detail screen,
  not the full calendar product.
- **Pet Profile / Home integration** — an "Upcoming vet visit" teaser on Pet
  Profile, and Home's ranking rule chain below.

### Home ranking changes (Handoff 03)

`HomeRankingInput` gained `booking: { hasUpcoming, bookingId }`, resolved by
`HomeService` from `prisma.booking.findFirst({ petId: activePet.id,
bookingStatus: CONFIRMED, startAt: { gte: now } })` — scoped to the active
pet specifically, so switching pets never leaks one pet's upcoming visit
into another's context. The updated rule chain:

1. No active pet → suggest adding one.
2. `health.visible` and vaccination `DUE_SOON`/`OVERDUE` → `VIEW_VACCINATION`.
3. `health.visible` and `health.profileStatus !== COMPLETE` → `COMPLETE_HEALTH`.
4. **New:** an upcoming `CONFIRMED` booking exists → `VIEW_BOOKING`
   (`/bookings/{id}`).
5. Otherwise, the existing care-profile-incomplete secondary + `VET`
   interest/Ask AI fallback, unchanged from Handoff 02.

**An ordinary upcoming booking deliberately never outranks a vaccination-due
or health-incomplete signal** (steps 2–3 are checked first) — there is no
emergency/critical-health severity logic yet (`HealthSeverity` beyond
`ATTENTION` is still unused), so a routine appointment is never treated as
more urgent than either.

## Services Marketplace Basics (Handoff 04)

Proves **Pet Context → Explore Services → Compatible Provider →
Availability → Booking → Permissioned Care Context → Service Outcome
Placeholder** across six new categories — Grooming, Training, Walking,
Sitting, Boarding, Pet Taxi — by *extending* the exact same
provider/availability/booking engine Handoff 03 built for vets, never a
second system. Explicitly **not** implemented: a provider dashboard or
availability-editor UI, live walking GPS, a live sitter timeline, taxi
driver tracking, messaging/chat, service photos/outcomes, an incident
system, provider payouts, real payments/refunds, provider reviews,
PostGIS-style nearby ranking, or any commerce/delivery integration — see
[Known limitations](#known-limitations--deliberate-simplifications).

### Provider reuse: `ProviderType` vs. `ServiceCategory`

A provider's `type` (`VET_CLINIC`/…/`GROOMER`/`TRAINER`/`WALKER`/`SITTER`/
`BOARDING`/`PET_TAXI`/`MULTI_SERVICE_PROVIDER`) and a service's `category`
(`VET`/`GROOMING`/`TRAINING`/`WALKING`/`SITTING`/`BOARDING`/`PET_TAXI`) are
**deliberately two separate fields, not one derived from the other**.
`type` is coarse, self-described business identity — closer to what shows
on a profile header, and a `MULTI_SERVICE_PROVIDER` can legitimately offer
services across several categories. `category` on `ProviderService` is the
one authoritative taxonomy every discovery/compatibility/Home/Care Calendar
rule keys off — never inferred from `type`, `ProviderServiceType`, or a
display string. This is the same "don't infer from a string" discipline the
spec applied to booking/calendar `titleKey`/`actionType` in Handoff 03.

### Service taxonomy and compatibility

`ServiceCategory` is a static, stable list (`GET /services/categories`
returns it verbatim — never "whatever categories currently have a live
provider"). Each `ProviderService` also carries optional compatibility
bounds — `minAgeMonths`/`maxAgeMonths`, `minWeightKg`/`maxWeightKg` (stored
normalized to kg, since `Pet.latestWeightValue` carries its own `WeightUnit`
and comparing raw values without a shared unit would silently misjudge
compatibility), and `requiresCareProfile`/`requiresHealthBasics` flags.

`PetServiceCompatibilityService.evaluate(pet, service)` is a deterministic,
no-ML check returning `{ status, reasons[] }`:

- **`NOT_SUPPORTED`** — a genuinely disqualifying, *known* fact: wrong
  species, or an age/weight value that is known and outside the service's
  stated range.
- **`UNKNOWN`** — a restriction exists (age or weight bounds) but the pet's
  own value is missing — never silently treated as compatible.
- **`NEEDS_REVIEW`** — the service requires a complete Care Profile and/or
  Health Basics and the pet's is not `COMPLETE` (including `PARTIAL`) —
  advisory, shown on every discovery/detail screen, **never a hard block**
  on its own.
- **`COMPATIBLE`** — none of the above.

Reasons are typed codes (`SPECIES_UNSUPPORTED`, `AGE_TOO_YOUNG`/`_TOO_OLD`/
`_UNKNOWN`, `WEIGHT_TOO_LOW`/`_TOO_HIGH`/`_UNKNOWN`, `CARE_PROFILE_REQUIRED`,
`HEALTH_BASICS_REQUIRED`), never localized copy — the frontend maps each to
display text, and **the reason is never hidden**, only ever shown alongside
its status.

The one place required context *does* hard-block a booking is
confirmation-time, and only for the extreme case: `BookingsService.confirm()`
throws `PET_CONTEXT_INCOMPLETE` when a required Care Profile/Health Basics
is entirely `NOT_STARTED` (nothing filled in at all). A `PARTIAL` profile is
allowed through — surfaced only as the advisory `NEEDS_REVIEW` above — so
the compatibility screen and the confirm gate agree on what "needs review"
vs. "actually blocked" means.

### Care access presets and `BookingPetAccess` (renamed from `BookingHealthAccess`)

Booking-time access now spans every category, not just vet visits, so the
Handoff 03 vet-only vocabulary was generalized rather than duplicated:

- **`HealthAccessScopePreset` → `PetAccessScopePreset`** — the three
  original vet presets (`MINIMAL_VET_CONTEXT`/`HEALTH_BASICS`/
  `SELECTED_HEALTH_DATA`) are unchanged; six new `*_BASIC` presets
  (`GROOMING_BASIC`/`TRAINING_BASIC`/`WALKING_BASIC`/`SITTING_BASIC`/
  `BOARDING_BASIC`/`TAXI_BASIC`) were added to the same enum.
- **`BookingHealthAccess` → `BookingPetAccess`** — same audit-link shape
  (`bookingId` ↔ `petAccessGrantId` ↔ `scopePreset`), same table, renamed.
- The migration performs a true SQL **rename** (`ALTER TYPE ... RENAME TO`,
  `ALTER TABLE ... RENAME TO` plus renaming its constraints/indexes) rather
  than Prisma's default drop-and-recreate — **every existing Handoff 03
  vet-booking access grant is preserved with zero data loss**; see the
  migration file's header comment for the exact statements.

Every non-vet preset is **Care Profile-only by default** —
`canViewHealth: false`, `canViewCareProfile: true` — matching the spec's
"never grant health data unless the service actually needs it." The one
exception is `BOARDING_BASIC`, which also sets `canViewHealth: true`,
because boarding requirements routinely include "vaccination status where
applicable" and there is no narrower, field-level scope this phase (the
same limitation already noted for `SELECTED_HEALTH_DATA`). `canViewLocation`
is not baked into any preset — it is computed per booking from the
service's `LocationMode` (`true` for anything except `AT_PROVIDER`), since
"can the provider see the customer's address" is a fact about *where* the
service happens, not which category it is. `DEFAULT_SCOPE_PRESET_BY_CATEGORY`
picks the right preset automatically when a booking doesn't explicitly
choose one — never "full record" by default, for any category.

### Location modes and addresses

`ProviderService.locationMode` — `AT_PROVIDER` / `AT_CUSTOMER` / `MOBILE` /
`TRANSPORT` — decides whether a booking needs an address, denormalized onto
`Booking.locationMode` at confirmation time (same "denormalize what was
actually booked" pattern as `Booking.category`). A new, deliberately minimal
`CustomerAddress` model (`POST /addresses` + `GET /addresses` only — no
update/delete endpoint this phase, since an address referenced by any
booking is `onDelete: Restrict`) backs it:

- `AT_PROVIDER` (clinic/grooming salon/boarding facility) — no address at all.
- `AT_CUSTOMER`/`MOBILE` (sitting/training/walking, or a provider that
  travels to the customer) — `Booking.customerAddressId` required.
- `TRANSPORT` (pet taxi) — **both** `customerAddressId` (pickup) and
  `dropoffAddressId` (dropoff) required.

`BookingsService.confirm()` enforces this and throws `ADDRESS_REQUIRED`
(with which field is missing) when a required address wasn't supplied — an
`AT_PROVIDER` booking never even looks at address fields, so a stray value
sent by mistake is simply ignored rather than stored.

### Multi-day bookings (Sitting/Boarding)

`Booking.startAt`/`endAt` already generically support any duration — the
exact same two columns that represented a 30-minute vet slot now represent
a multi-night Boarding stay, **no schema change was needed**. What *did*
need extending was the booking flow itself: Sitting/Boarding are booked as
a check-in/check-out **date range** chosen directly by the user, not a
discrete slot picked from `SlotGeneratorService` output (there is no
meaningful way to enumerate every possible multi-day range as "slots").
`BookingsService.createHold()` branches on category:

- Fixed-length categories (Vet/Grooming/Training/Walking/Pet Taxi) — the
  existing `SlotGeneratorService` flow, unchanged.
- `SITTING`/`BOARDING` — the client sends `rangeStart`/`rangeEnd` directly;
  the service checks for any overlapping active booking at that provider
  location (`SLOT_UNAVAILABLE` if found) and creates the hold over that
  exact range.

**Double-booking prevention for date ranges** needed a real DB-level
guarantee beyond the Handoff 03 exact-`startAt` partial unique indexes
(which only catch identical-start collisions, not partial overlaps between
two different ranges): a Postgres **`EXCLUDE` constraint** using
`btree_gist` — `EXCLUDE USING gist ("providerLocationId" WITH =,
tsrange("startAt","endAt") WITH &&) WHERE (category IN ('SITTING',
'BOARDING') AND bookingStatus NOT IN (...cancelled...))` — makes two
genuinely overlapping Boarding/Sitting bookings at the same location
impossible even under a concurrent race, the same "app check plus a real DB
constraint as the actual guarantee" pattern as Handoff 03's slot holds.

### Recurring bookings (Walking/Training/Grooming only)

A new `BookingSeries` model (`ONE_TIME`/`WEEKLY` `frequency`,
`ACTIVE`/`PAUSED`/`CANCELLED`/`COMPLETED` `status` — only `ACTIVE`/
`CANCELLED` are reachable this phase) backs a conservative recurrence
feature: `POST /bookings/:id/recur` takes an already-`CONFIRMED` booking in
one of the three eligible categories and generates up to 7 additional
weekly occurrences (2–8 total), each independently validated against
`SlotGeneratorService` — **a date that's no longer available is simply
skipped**, never failing the whole series. Every occurrence is a completely
normal `Booking` row (`bookingSeriesId` just links it back); **cancelling
one occurrence via the existing `POST /bookings/:id/cancel` never touches
the series row or any sibling occurrence** — series and occurrence are
deliberately kept independent, exactly as the spec requires. There is no
series-wide cancel/pause endpoint this phase — see Known limitations.

### Home ranking and Care Calendar generalization

`HomeRankingBookingInput` gained `category`, used only to pick a
category-specific `labelKey` (`home.action.viewBooking.grooming`, `.walking`,
etc.) — **the priority position is unchanged**: an upcoming booking of *any*
category still sits after vaccination-due/health-incomplete and before the
care-fallback, per the same reasoning as Handoff 03 (no emergency-health
severity logic exists yet, so no booking — vet or otherwise — is ever
treated as more urgent). Home surfaces at most one upcoming-booking action
at a time regardless of how many categories have bookings, per the spec's
"do not overwhelm Home."

`CareCalendarEventType` gained `GROOMING_APPOINTMENT`/`TRAINING_SESSION`/
`WALK`/`SITTING`/`BOARDING`/`PET_TAXI` alongside the original
`VET_APPOINTMENT`; `CareCalendarService` maps a booking's `category` to the
right type and `titleKey` via a lookup table, with zero other logic change
— a Sitting/Boarding event's `startAt`/`endAt` are the exact multi-day range
the booking was confirmed with, so the calendar renders it as a genuine
date range (`apps/web/lib/date/appointment-date.ts`'s `formatDateTimeRange`
collapses to a single timestamp only when start and end fall on the same
calendar day).

### API endpoints (Handoff 04 additions)

```
GET    /services/categories
GET    /providers/services                           (category, city, species, verifiedOnly, search, petId?)
GET    /provider-services/:serviceId                  (petId?)
GET    /provider-services/:serviceId/availability     (locationId?, from, to, petId?, providerUserId?)

POST   /addresses
GET    /addresses                                     (householdId)

POST   /booking-holds                                 (slotStart, OR rangeStart+rangeEnd for Sitting/Boarding)
POST   /bookings                                      (accessSelection, customerAddressId?, dropoffAddressId?)
GET    /bookings                                      (upcoming, past, cancelled, petId)
POST   /bookings/:id/recur                            (occurrences: 2-8; Walking/Training/Grooming only)
```

`POST /bookings`'s `healthAccessSelection` field is renamed
`accessSelection` (any `PetAccessScopePreset`, not just the vet-only ones);
existing `POST /booking-holds`/`POST /bookings`/`GET /bookings`/
`GET /bookings/:id`/`POST /bookings/:id/cancel` routes and behavior are
otherwise unchanged and still power the Handoff 03 vet flow directly — no
second booking engine.

### Error codes (Handoff 04 additions)

```
PET_CONTEXT_INCOMPLETE  400  a required Care Profile/Health Basics is entirely NOT_STARTED (see above)
ADDRESS_REQUIRED        400  the service's LocationMode needs an address that wasn't supplied
```

`SLOT_UNAVAILABLE`/`HOLD_EXPIRED`/`BOOKING_CONFLICT`/`PROVIDER_NOT_VERIFIED`/
`SERVICE_NOT_AVAILABLE`/`PET_NOT_SUPPORTED`/`BOOKING_NOT_CANCELLABLE` and the
reused `PET_ACCESS_DENIED` (from Handoff 01/03) apply unchanged across every
category.

### UI screens (Handoff 04 additions)

- **Explore Services** (`/services`) — category tiles (Grooming/Training/
  Walking/Sitting/Boarding/Pet Taxi) with the active pet's context visible;
  switching the active pet before navigating here always recalculates
  compatibility from scratch on the next screen (no caching).
- **Service Results** (`/services/[category]`) — provider/service cards
  with verification, price, next availability, and a compatibility badge
  that always shows its reason, never hides it.
- **Service Booking Wizard** (`/services/[category]/[serviceId]/book`) — one
  route, internal steps mirroring the Handoff 03 wizard's pattern: a
  **Slot Picker** for fixed-length categories or a **check-in/check-out
  date-range step** for Sitting/Boarding, an **Address** step inserted only
  when the service's `LocationMode` needs one, **Review**, and **Care
  Sharing** (Who/What/Why/Until copy, the category's specific preset shown
  and explained rather than a picker — the spec's own Care Sharing examples
  show one recommended preset per category, not a multi-choice picker like
  the vet flow's three vet-specific presets).
- **My Bookings** (`/bookings`) — Upcoming/Past/Cancelled tabs across every
  pet and category in one list, category-labeled rows; vet and marketplace
  bookings appear together since they're the same `Booking` entity.
- **Booking Detail** (`/bookings/[id]`, generalized) — moved from
  `features/vet/` to `features/bookings/` now that it's category-generic:
  "Health access" copy became "Care access", the date/time row renders a
  range for multi-day bookings, a dropoff address row appears for Pet Taxi,
  and a "Repeat weekly" action appears for Walking/Training/Grooming
  bookings with no series yet.
- **Care Calendar** (`/care-calendar`) — unchanged screen, now renders every
  category's event type and multi-day ranges via the same date-range helper.
- **Pet Profile / Home** — the "Upcoming vet visit" teaser became a
  category-aware "Upcoming service" teaser; Home's primary action label is
  category-specific (see above).
- **Explore Services entry point** — a small "Explore Services" card was
  added to Home (linking to `/services`), since the app has no persistent
  bottom navigation; every other screen is still reached by direct
  navigation/links, consistent with Handoff 01–03.

Two wizard components — the original vet-only `BookingWizard`
(`features/vet/`) and the new, category-generic `ServiceBookingWizard`
(`features/services/`) — intentionally coexist rather than being merged
into one component this phase, to avoid destabilizing the already-shipped,
already-tested vet flow. Both call the exact same backend endpoints.

## Minimal Provider OS (Handoff 05)

A dedicated, minimal Provider OS — sign in, see today's work, manage
availability, see and act on bookings — extending the exact same
User+Session auth, `ProviderUser`/`ProviderOrganization`/`Booking`/
`PetAccessGrant` models Handoffs 03-04 built. No second auth system, no
second booking state machine, no pet-data permission model change.

### Provider authorization is a separate axis from pet-data authorization

`ProviderUserRole` (`OWNER`/`VET`/`STAFF`, unchanged from Handoff 03)
controls only provider-side operational actions — viewing bookings,
managing availability, cancelling bookings, editing services, viewing the
team. It is never consulted by `PetAccessGuard`, and `PetAccessGrant`/
`BookingPetAccess` remain the only source of truth for what a provider can
see about a pet. `ProviderAuthGuard` (mirrors `PetAccessGuard`'s shape) is
a completely separate guard: it resolves the caller's active provider
organization and, when a handler declares `@RequireProviderRole(...)`,
checks role — it never touches `PetAccessGrant` at all. Every Provider OS
service method that also needs pet data (`ProviderBookingsService.getById`)
resolves that access itself, from the *specific* `BookingPetAccess` link
for that booking, not from a general permission check — see "Pet-data
access" below.

### Provider context (`ProviderContextPreference`)

A user may belong to more than one `ProviderOrganization` (multiple
`ProviderUser` rows for the same `userId`). `ProviderContextService`
mirrors `ActivePetPreference`'s exact pattern: a user with exactly one
membership never needs to choose (it's resolved automatically); a user
with more than one must set `ProviderContextPreference` explicitly via
`PUT /provider/me/context` — the organization is **never** inferred when
ambiguous. `GET /provider/me/context` never throws (even when ambiguous or
when the user has no membership at all) so the Provider Shell can always
render a "choose an organization" picker; every other Provider OS route,
via `ProviderAuthGuard`, throws `PROVIDER_ACCESS_DENIED` with
`details.reason: "AMBIGUOUS_CONTEXT"` (including the candidate
organizations) if no explicit choice can be resolved.

### Availability management (reuses the Handoff 03 models, no second engine)

`ProviderAvailabilityService` is CRUD over the existing
`ProviderAvailabilityRule`/`ProviderAvailabilityException` rows — the same
rows `SlotGeneratorService` already projects into slots; nothing about
slot generation changed. Per the Stage 1 architecture review, conflict
detection (spec section 9 — "do not silently cancel or move a booking")
applies only to `BLOCKED` exceptions, not recurring rules: creating or
updating a `BLOCKED` exception that overlaps a `CONFIRMED`/`CHECKED_IN`/
`IN_PROGRESS` booking at that location (and, if set, that provider user)
returns `409 AVAILABILITY_CONFLICT` with the conflicting booking count/ids
unless the request also sets `acknowledgeConflict: true` — and even then,
creating the exception **never** touches the conflicting bookings; the
provider has just explicitly acknowledged the overlap exists. Recurring
rules run no such check (reconciling a rule against every future booking
is disproportionately complex for this phase — documented, not silently
skipped).

### Booking operational transitions (finally reaching the existing vocabulary)

`BookingStatus` already had `CHECKED_IN`/`IN_PROGRESS`/`COMPLETED`/
`CANCELLED_BY_PROVIDER` in its vocabulary since Handoff 03 — no endpoint
ever reached them. `ProviderBookingsService` is what finally does, via a
strict single-step transition table (`CONFIRMED → CHECKED_IN → IN_PROGRESS
→ COMPLETED`); any other requested transition is rejected as
`400 INVALID_BOOKING_TRANSITION`. Category (Grooming/Training/Walking/
Sitting/Boarding/Pet Taxi/Vet) only changes labels in the UI — it is never
a second state machine, and Walker/Sitter/Taxi "Start Walk"/"Start
Sitting"/"Start Trip" actions all map to the exact same `IN_PROGRESS`
transition with no live GPS or fake tracking.

- **`POST /provider/bookings/:id/confirm`** is an idempotent no-op valid
  only from an already-`CONFIRMED` booking. This architecture (Handoff 03)
  never persists a genuine `HOLD`/`PENDING_CONFIRMATION` row to confirm —
  a booking is created directly at `CONFIRMED` — so there is no real state
  to transition; the endpoint exists for spec completeness and produces an
  auditable `ProviderBookingConfirmed` event even for the no-op case.
- **`POST /provider/bookings/:id/cancel`** transitions to
  `CANCELLED_BY_PROVIDER` (never deletes the row), reuses
  `BookingPetAccessService.revokeForBooking` and
  `CareCalendarService.markCancelled` exactly as the consumer-side cancel
  path does (no duplicated revocation/calendar logic), and is gated only
  by booking status (`HOLD`/`PENDING_CONFIRMATION`/`CONFIRMED`/
  `CHECKED_IN`) — not by organization verification, since cancelling is
  never a "marketplace exposure" action.
- **`check-in`/`start`/`complete`** are gated by
  `ProviderOrgNotVerifiedException` (`403 PROVIDER_NOT_VERIFIED`) when the
  organization isn't `VERIFIED` — the one place this phase enforces "do
  not silently allow marketplace actions" (spec section 6) as a hard block
  rather than just a UI banner.
- **`complete`** sets `completedAt`/`completedByProviderUserId` (a plain
  UUID reference, no FK — same precedent as `PetAccessGrant.grantedByUserId`,
  so deleting a `ProviderUser` later never alters booking history) and the
  optional, deliberately small owner-visible `completionNote` (e.g. "Luna's
  grooming was completed."), and calls the new
  `CareCalendarService.markCompleted` (mirrors `markCancelled`) so the
  calendar's already-modeled `COMPLETED` status is finally reached too.

### Pet-data access on a booking (`ProviderPetAccessContextDto`)

A provider viewing a booking's detail sees the **specific** grant that
booking created, resolved from `BookingPetAccess` (unique per booking) —
never the caller's general effective-permissions union across every grant
they hold for that pet, and never a different provider user's grant. The
response's `access.state` is always one of four explicit values, so the UI
never needs to guess *why* something isn't visible ("no invisible provider
access", spec section 14):

| `state`    | Meaning                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| `GRANTED`  | This booking created a grant, it belongs to the viewing provider user, and it's currently active. |
| `NO_GRANT` | No `providerUserId` was ever assigned to this booking (see `BookingPetAccessService.grantForBooking`'s early return), so no grant exists for anyone — or the viewing provider user isn't the one it was granted to (e.g. a receptionist viewing a vet's booking). |
| `EXPIRED`  | A grant exists and belongs to this provider user, but its `expiresAt` has passed. |
| `REVOKED`  | A grant exists and belongs to this provider user, but it was explicitly revoked (e.g. by a cancellation). |

`careProfile`/`healthSummary` in the response are `null` unless
`access.canViewCareProfile`/`canViewHealth` are true for *this* grant —
resolved and gated before `CareProfileService.get`/
`HealthSummaryService.getSummary` are even called, never fetched and then
hidden in the UI.

### Provider notes vs. the owner-visible completion note

`BookingProviderNote` (new model) is internal-only free text attached to a
booking (`POST /provider/bookings/:id/notes`) — never sent to the
customer, and never shown on any consumer-facing screen. It is
deliberately separate from `Booking.completionNote`, the one small
owner-visible string set only by the `complete` transition; there is no
general provider-to-customer messaging this phase.

### Provider Shell (a completely separate UI, spec section 27)

`apps/web/features/provider/ProviderShell.tsx` is a dedicated layout —
its own session check, its own bootstrap (`useProviderBootstrap` →
`GET /provider/me/context`), its own Zustand store (`provider-store.ts`)
— never sharing state or navigation with the consumer `AppShell`. Routes
live under a separate `(provider)` route group so they never appear in
consumer navigation: `/provider` (Home), `/provider/bookings` (queue),
`/provider/bookings/:id` (detail), `/provider/calendar` (Today/Agenda/Week
schedule), `/provider/availability` (rules/exceptions), `/provider/services`
(admin), `/provider/team` (roster). The shell's header shows organization
name, role, and — when the organization isn't `VERIFIED` — an explicit
"operational restriction" banner rather than silently allowing the same
actions a verified organization would have. A user with more than one
provider membership sees an organization picker instead of a guessed
default, matching the backend's "never infer implicitly when multiple
exist" rule exactly.

### Services admin (minimal, spec sections 24-25)

`GET/PATCH /provider/services/:id` edits `name`/`description`/
`priceAmount`/`durationMinutes`/`isActive`/`supportsDog`/`supportsCat`/
`minAgeMonths`/`maxAgeMonths`/`requiresCareProfile`/`requiresHealthBasics`/
`locationMode` — never `category`/`type`/`providerOrganizationId`/
`locationId` (structural, out of scope for a minimal admin surface).
`PATCH` is `OWNER`-role-only (`@RequireProviderRole(OWNER)`), the one
place this phase distinguishes `OWNER` from `VET`/`STAFF` operationally.
Disabling a service (`isActive: false`) never cancels its future
bookings — `BookingsService.createHold()` already rejects new holds
against an inactive service (Handoff 04), so "only prevents new bookings"
falls out of existing code with no extra work; a `locationMode` change
while future confirmed bookings exist is separately blocked with
`409 SERVICE_HAS_FUTURE_BOOKINGS`, since changing where a service happens
could break an already-confirmed booking's location expectations (the one
genuine structural-change risk this phase actually guards against).

### Team (read-only, spec section 26)

`GET /provider/team` lists `ProviderUser` rows for the caller's active
organization (name/role/`displayTitle`). No invitation/deactivation flow —
`status` is always the literal `"ACTIVE"` since no deactivation mechanism
exists yet.

### Dual calendar / timezone

Provider OS screens reuse the exact same `formatAppointmentDateTime`/
`formatDayLabel`/`formatDateTimeRange` ICU helpers (`-u-ca-persian`/
`-u-ca-gregory`) Handoffs 03-04 built — no new date library, no duplicate
Jalali dates stored. "Today" boundaries in `ProviderOverviewService`/
`ProviderBookingsService` use plain UTC calendar-day math rather than the
provider location's own timezone — see Known limitations.

### API endpoints (Handoff 05 additions)

See the full endpoint list below (`GET/PUT /provider/me/context` through
`GET /provider/team`).

### Error codes (Handoff 05 additions)

```
PROVIDER_ACCESS_DENIED        403  no ProviderUser membership, ambiguous multi-org context with no
                                    explicit choice, insufficient role, or a resource belonging to a
                                    different organization (never a silent 404 for the last case)
PROVIDER_NOT_VERIFIED         403  the organization must be VERIFIED before check-in/start/complete
BOOKING_NOT_FOUND             404  no booking with that id
INVALID_BOOKING_TRANSITION    400  the requested transition isn't the single next step from the
                                    booking's current status
AVAILABILITY_CONFLICT         409  a BLOCKED exception would overlap existing confirmed bookings;
                                    resend with acknowledgeConflict: true to proceed anyway
SERVICE_HAS_FUTURE_BOOKINGS   409  a locationMode change is blocked while future confirmed bookings
                                    exist for that service
ACCESS_EXPIRED                403  part of the vocabulary for a lapsed booking-linked grant; not yet
                                    thrown by any endpoint — see Known limitations
```

`BOOKING_NOT_CANCELLABLE`/`PET_ACCESS_DENIED` (reused, unchanged) also
apply to the Provider OS's own cancel/pet-context paths respectively.

### UI screens (Handoff 05 additions)

- **Provider Home** (`/provider`) — "what needs my attention today?":
  today's bookings, the next booking, attention counts (pending
  confirmations, recent cancellations, unresolved availability conflicts),
  deliberately no vanity analytics (no lifetime totals, no revenue).
- **Bookings queue** (`/provider/bookings`) — Today/Upcoming/Past/Cancelled
  filters; compact rows (Pet/Owner/Service/Time/Location/Booking Status/
  Payment Status kept visually separate).
- **Booking Detail** (`/provider/bookings/:id`) — the four-state pet-access
  section above, Care/Health context when granted, internal provider notes
  (with the internal-only label always shown), and the state-appropriate
  action bar (Confirm/Check in/Start/Complete/Cancel).
- **Schedule** (`/provider/calendar`) — Today/Agenda/Week, grouped by day,
  built from the exact same `GET /provider/bookings` the queue uses (no
  new calendar engine, no drag/drop).
- **Availability** (`/provider/availability`) — weekly rule list + add
  form, exceptions list + add form with the explicit conflict-acknowledgement
  flow (never a silent auto-proceed).
- **Services** (`/provider/services`) — list with inline edit and an
  active/disable toggle; `OWNER`-only edits surface a clear
  "only an organization owner can change services" message rather than a
  generic error.
- **Team** (`/provider/team`) — read-only roster.

## Commerce Core (Handoff 06)

Cart → Checkout → Order commerce as a modular monolith (Catalog, Sellers,
Inventory, Cart, Checkout, Orders, Payments, `ProductCompatibility` —
separate modules under `apps/api/src/modules/commerce/`, no
microservices). Reuses the existing session auth, `PetAccessGrant`
authorization, `CustomerAddress`, transactional outbox, and
`IdempotencyInterceptor` — no second auth system, no second address
system, no second idempotency framework.

### Product → Variant → Offer → Seller → Inventory (never collapsed)

Five strictly separate concepts, per the spec's core architecture:

| Model | Owns | Never owns |
| --- | --- | --- |
| `Product` | catalog identity — title/slug/description/brand/category, plus the compatibility-input fields (`supportsDog`/`supportsCat`/`minAgeMonths`/`maxAgeMonths`/`minWeightKg`/`maxWeightKg`/`allergenTags`/`requiresHealthReview`) | price, inventory, or a seller |
| `ProductVariant` | one purchasable configuration of a Product — `sku`/`barcode`/`title`/`attributes`/`weightValue`/`weightUnit` | price or inventory |
| `SellerOffer` | one seller's price (`priceAmount`/`compareAtAmount`/`currency`) for one Variant | inventory count, catalog identity |
| `SellerOrganization` | `verificationStatus`/`status`/business identity | product or price data |
| `InventoryItem` | `onHand`/`reserved` for exactly one `SellerOffer` | catalog or seller identity |

One Variant can have offers from many sellers (`Product → ProductVariant →
[SellerOffer × N sellers] → InventoryItem`); `GET /shop/products/:id/offers`
returns every `ACTIVE` offer across every variant so the offer-selection
step can show them side by side. A `Product` deliberately mirrors
`ProviderService`'s exact compatibility-field shape (age/weight/species)
rather than the spec's literal `speciesCompatibility` array — documented
here as a clean, intentional equivalent, not a deviation.

Only a **`VERIFIED` + `ACTIVE`** `SellerOrganization`'s offers are ever
discoverable or purchasable — `CatalogService`'s `ACTIVE_OFFER_WHERE`
filter and `CartService.addItem`'s own re-check both enforce this
independently (never trust a stale/cached "verified" flag from the
browsing step). The seed data includes one seller stuck at `SUBMITTED`
specifically to prove this gate: its offers never appear in discovery and
adding one to a cart is rejected.

### Inventory (`InventoryItem`) — PostgreSQL is the only source of truth

`onHand`/`reserved` live in Postgres, never Redis or an in-memory cache;
`available = onHand - reserved` is always computed, never stored. Three
raw-SQL `CHECK` constraints (Prisma's DSL can't express multi-column
checks — same precedent as the original `schema_hardening` migration's
`users` contact-info `CHECK`) make the invariant impossible to violate at
the database layer even if application code has a bug:

```sql
CHECK ("onHand" >= 0)
CHECK ("reserved" >= 0)
CHECK ("reserved" <= "onHand")
```

`InventoryReservationService.reserve()` takes a `SELECT ... FOR UPDATE`
row lock on the `InventoryItem` row before reading `onHand`/`reserved`, so
two concurrent checkouts racing for the last unit of stock serialize
correctly instead of both succeeding.

### `ProductCompatibilityService` — deterministic, never defaults to COMPATIBLE

Mirrors `PetServiceCompatibilityService`'s escalate-to-worst-status
pattern (Handoff 04) but with a six-value vocabulary:

```
COMPATIBLE                    a real constraint was actively evaluated and passed
LIKELY_COMPATIBLE             nothing applicable to actively confirm (e.g. an unrestricted product)
NEEDS_REVIEW                  a required fact is missing, or requiresHealthReview until Health Basics is COMPLETE
NOT_RECOMMENDED               an actual constraint violation (species/age/weight)
POTENTIAL_SAFETY_CONFLICT     a known active allergy matches an allergenTag — always outranks every other status
UNKNOWN                       no active pet in context at all
```

`COMPATIBLE` is earned, not assumed: the service tracks whether *any*
constraint was actively evaluated and passed (species match, age/weight
within range, health review complete, no allergen conflict); a product
with zero applicable constraints stays `LIKELY_COMPATIBLE` rather than
claiming a real endorsement it never checked. `POTENTIAL_SAFETY_CONFLICT`
is the highest-ranked status precisely so it can never be outranked by a
discount, promotion, or seller ranking (there are none of those this
phase, but the rank ordering is what future promotion work must respect).
The allergen check requires `canViewHealth` (via
`PetAccessService.getEffectivePermissions`) *before* even querying
`Allergy` rows — a caller without health-data access sees `NEEDS_REVIEW`,
never a false `COMPATIBLE` and never a permission leak. Reason codes
(`SPECIES_MISMATCH`/`AGE_TOO_OLD`/`ALLERGEN_CONFLICT`/etc.) are returned
alongside the status — the frontend always shows the reason, never just a
color.

### Cart — persistent, server-side, priced live

`Cart`/`CartLine` are real Postgres rows (`status`: `ACTIVE`/`CONVERTED`/
`ABANDONED`), not a client-only or Redis-only structure — `GET /cart`
always reflects the same cart across devices/sessions. Each line snapshots
the price at add-time (`unitPriceSnapshot`) but the cart response always
computes `currentPriceAmount` from the *live* offer and flags
`priceChanged` when they differ — the UI shows the current price with a
"price changed" indicator, never the stale snapshot silently presented as
current. `CartLine.targetPetId` is nullable and per-line (not per-cart),
so two lines in the same cart can target different pets, and changing
which pet a line targets (implicitly, by re-adding under a different
active pet) recomputes that line's compatibility independently — no
`targetPetId` uniqueness constraint exists because Postgres treats `NULL`
as distinct in unique indexes (two "no target pet" lines for the same
offer would NOT collide against such a constraint); `CartService.addItem`
instead does an explicit `findFirst` + increment at the application layer,
sidestepping the SQL semantics issue directly. `GET /cart`'s response
groups lines by seller (`sellerGroups`) and reports `hasSafetyConflict`
whenever any line is `POTENTIAL_SAFETY_CONFLICT`, so the cart screen can
show one banner instead of forcing the reader to scan every line.

### Checkout — revalidates everything, never trusts the cart blindly

`POST /checkout` snapshots the cart into an immutable-for-this-attempt
`Checkout` row and revalidates every line: offer still `ACTIVE`, seller
still `VERIFIED`+`ACTIVE`, inventory still sufficient, price still current
(price drift is surfaced as a `CheckoutValidationIssueDto`, not a hard
block), and — the one hard block — any `POTENTIAL_SAFETY_CONFLICT` line
requires `acknowledgeSafetyConflict: true` on the request or the whole
checkout is rejected with `409 SAFETY_CONFLICT` (never a silent
downgrade). `CheckoutStatus` (`DRAFT`/`READY_FOR_PAYMENT`/
`PAYMENT_PENDING`/`CONFIRMED`/`PARTIALLY_CONFIRMED`/`FAILED`/`EXPIRED`) is
kept completely separate from `OrderStatus`/`PaymentIntentStatus` — see
"Financial state separation" below. Every successful `POST /checkout` also
reserves inventory for every line inside the *same* Prisma `$transaction`
that creates the `Checkout` row, so a checkout is never left holding
inventory it didn't actually reserve (or vice versa).

### Inventory reservation — a real row, a 15-minute TTL, checked at use-time

`InventoryReservation` (`ACTIVE`/`CONSUMED`/`RELEASED`/`EXPIRED`) is a
genuine table, not just a TTL key — `RESERVATION_TTL_MINUTES = 15`
(exported constant in `inventory-reservation.service.ts`) is the chosen
timeout, long enough to complete address/payment steps without feeling
rushed, short enough that abandoned checkouts don't lock up stock for
long. Correctness never depends solely on a background sweep: `pay()`
checks `checkout.expiresAt` itself and returns `410 CHECKOUT_EXPIRED`
(releasing the reservation inline) if the checkout has expired by the time
payment is attempted, rather than trusting that a cron job already cleaned
it up. `reserve()`/`releaseAllForCheckout()`/`consumeAllForCheckout()` are
the only three places `InventoryItem.reserved` is ever mutated, each
inside a transaction.

### "1 Checkout → N Orders" (the architecture's central rule)

A `Checkout` can span multiple sellers; a successful payment creates
**exactly one `Order` per seller represented in that checkout's cart
lines**, never one combined order and never one order per line.
`Order.@@unique([checkoutId, sellerOrganizationId])` is what makes this
both structural and idempotent: `OrdersService.createForCheckout()` groups
lines by seller and creates one `Order` + its `OrderItem`s per group
inside the same transaction that consumes the reservation and confirms
the checkout; if the same checkout's confirmation is triggered twice (a
retried `pay()` call, or a race between the synchronous path and a
webhook — see below), the second attempt's `Order` creation hits the
unique constraint (Prisma `P2002`) and the service catches it and returns
the *existing* order instead of erroring or duplicating — the same
double-booking guard pattern `BookingsService` already used in Handoff 03.
Each `OrderItem` carries a fully immutable commercial snapshot
(`productTitleSnapshot`/`variantTitleSnapshot`/`skuSnapshot`/`quantity`/
`unitPrice`/`totalPrice`/`targetPetId`/`compatibilitySnapshot`) taken at
order-creation time — a `Product` or `SellerOffer` changing *after* the
order exists never alters what the order shows, by construction, not by
convention.

### Payment abstraction — `PaymentGateway` interface, one real implementation

```
PaymentIntent   REQUIRES_PAYMENT_METHOD → PENDING/AUTHORIZED → CAPTURED (or FAILED/CANCELLED)
PaymentAttempt  STARTED → PENDING/SUCCEEDED/FAILED/CANCELLED  (one per charge attempt)
Transaction     CHARGE|REFUND, PENDING/SUCCEEDED/FAILED       (the ledger-adjacent audit row)
```

`PaymentGateway` is a plain interface (`charge(input): Promise<PaymentChargeResult>`)
behind a DI token (`PAYMENT_GATEWAY`); `DevPaymentGateway` is the only
implementation this phase (`PaymentProvider.DEV_SIMULATED` is the only
enum value — no `SnappPay`/`DigiPay`/real gateway integration exists or is
stubbed with fake credentials). It never talks to a network; a `mode`
parameter (`SUCCESS`/`FAILURE`/`PENDING`, default `SUCCESS`) picked by the
caller decides the outcome, which is exactly what the checkout flow's
"Development Payment" UI exposes as three explicit buttons in dev/test
only — production copy would say "Online Payment" with no mode choice and
no mention of "DevPaymentGateway" anywhere in the UI. The full flow: create
Checkout → reserve inventory → create `PaymentIntent` → `DevPaymentGateway`
authorize/capture → on success, consume the reservation, create the
Order(s), mark the Checkout `CONFIRMED`, convert the Cart — all inside one
transaction (`CheckoutService.finalizeSuccessfulPayment`).

- **Failure** (`mode: "FAILURE"`) never confirms an order and deliberately
  leaves the reservation `ACTIVE` (not released) — cart and checkout stay
  fully recoverable, and a retry doesn't lose its place in the stock queue;
  a reservation is only ever released on genuine expiry.
- **Pending** (`mode: "PENDING"`) sets `Checkout.PAYMENT_PENDING` with no
  order confirmation yet — the future-safe async path below is what
  eventually resolves it.

### Webhook slot + the synchronous/async race it had to avoid

`POST /payments/webhooks/:provider` exists and is fully tested end to end
for `dev_simulated` — no other provider is implemented or claimed.
`WebhookSignatureVerifier` is a real interface (`DevWebhookSignatureVerifier`
always returns `true`, documented as dev-only) so a real gateway's
signature check has a slot to drop into later without changing the
controller. Resolving a pending intent via webhook
(`PaymentsService.resolvePendingIntent`) publishes `PaymentSucceeded` with
`viaWebhook: true`; **`PaymentEventsListener` only acts on that event when
`viaWebhook` is true** — this flag exists specifically because
`EventEmitter2.emit()` invokes listeners without awaiting them, so if the
listener reacted to *every* `PaymentSucceeded` (including the one the
synchronous `pay()` handler's own call chain implicitly triggers), it
would race that handler's direct call to `finalizeSuccessfulPayment()`,
risking a double order-creation attempt. `finalizeSuccessfulPayment` is
itself idempotent (checks for an already-`CONFIRMED` checkout and returns
the existing order ids), so the flag is defense in depth on top of an
already-safe function, not the only thing preventing a duplicate.

### Idempotency

`POST /checkout`, `POST /checkout/:id/payment-intent`, and
`POST /checkout/:id/pay` all accept the existing `Idempotency-Key` header
via the existing `IdempotencyInterceptor` (Redis-cached-response, same
mechanism as pet creation and booking confirmation) — a retried request
with the same key returns the original response rather than reserving
inventory, charging, or creating orders a second time.
`PaymentsService.createIntent()` is separately idempotent at the
service layer (reuses an existing non-terminal intent for the checkout
rather than creating a second one), and order creation is idempotent via
the `Order` unique constraint described above — three independent layers,
each guarding a different retry path.

### Financial state separation (no giant enum)

`CheckoutStatus`, `OrderStatus`, `PaymentIntentStatus`,
`PaymentAttemptStatus`, and `TransactionStatus` are five separate enums on
five separate models — a checkout being `CONFIRMED` says nothing directly
about an individual order's `OrderStatus`, and a `PaymentIntent` reaching
`CAPTURED` is a separate fact from the `Order` rows it caused to be
created. `OrderStatus` defines the full future vocabulary (`PREPARING`/
`READY_FOR_FULFILLMENT`/`FULFILLED`/`PARTIALLY_REFUNDED`/`REFUNDED`) but
only `PENDING`/`CONFIRMED`/`CANCELLED` are reachable this phase — the rest
exist so a future fulfillment/returns handoff doesn't need a migration to
add them.

### IRR is the integer source of truth; Toman is a display-only transform

Every money column (`SellerOffer.priceAmount`, `Cart`/`Checkout`/`Order`
totals, `PaymentIntent.amount`, `Transaction.amount`) is a plain Prisma
`Int` storing IRR — never a float, and, deliberately, never `Decimal`
either (a departure from `ProviderService.priceAmount`'s `Decimal`
pattern from Handoffs 03-04, made explicit here because the spec requires
"never floating point" and an integer minor-unit is the simplest way to
guarantee it). The frontend's one and only currency-formatting function,
`formatCurrency()` (`apps/web/lib/currency/format-currency.ts`), divides
by 10 to display Toman (1 Toman = 10 Rial is a fixed, well-defined ratio —
never a real-time exchange rate, so this division is safe in a way a
currency conversion never would be) and is the only place in the entire
frontend that ever performs this conversion.

### Price snapshot vs. commercial snapshot (three distinct concepts, on purpose)

1. **`CartLine.unitPriceSnapshot`** — the price at add-time; shown to the
   user only as a "did the price change?" comparison against the live
   offer, never as the authoritative total.
2. **`Checkout` totals** — computed from the *validated, current* price at
   checkout-creation time; this is what payment actually charges.
3. **`OrderItem.unitPrice`/`totalPrice`/snapshots** — frozen forever at
   order-creation time; nothing that happens to the `Product` or
   `SellerOffer` afterward can ever change what an `Order` displays.

### Transaction boundaries

Every multi-row mutation that must be all-or-nothing is wrapped in a
single Prisma `$transaction`: checkout creation + inventory reservation
(`CheckoutService.create`), and the entire successful-payment path —
consume reservation → create Order(s) → confirm Checkout → convert Cart
(`CheckoutService.finalizeSuccessfulPayment`). Domain events for these
critical operations (`InventoryReserved`, `OrderCreated`, `OrderConfirmed`,
`CartConverted`, `PaymentSucceeded`) are published inside the same
transaction where practical, following the existing outbox pattern —
no new event infrastructure.

### Consumer UI (`apps/web/features/commerce/`)

Shop Home (`/shop`) → Product Results (`/shop/products`) → Product Detail
(`/shop/products/:id`, hierarchy: Pet Context → Compatibility → Product →
Variant → Offer → Add to Cart, compatibility always shown above the CTA)
→ Cart (`/cart`, grouped by seller) → Checkout (`/checkout`, one route
with internal steps — address/delivery → review → payment → pending/failed
— mirroring `ServiceBookingWizard`'s established "one route, internal
steps" pattern) → Order Confirmation (`/checkout/:id/confirmation`, each
seller's Order shown as its own block) → My Orders (`/orders`, an Order is
its own record, never re-derived solely from its Checkout) → Order Detail
(`/orders/:id`). No fake ratings, no "best price" labeling, no sponsored
placement anywhere in the product list or offer selection — every offer
shows seller name, price, availability, and verification, and the user
decides. Home gets one small, non-aggressive "Shop" card (mirroring the
existing "Explore Services" card) — no commerce dashboard, no upsell
carousel.

### API endpoints (Handoff 06 additions)

See the full endpoint list below (`GET /shop/categories` through
`GET /orders/:id`).

### Error codes (Handoff 06 additions)

```
PRODUCT_NOT_AVAILABLE          404  product missing or not ACTIVE
OFFER_NOT_AVAILABLE            409  offer missing, not ACTIVE, or its seller no longer VERIFIED+ACTIVE
SELLER_NOT_AVAILABLE           409  the offer's seller isn't VERIFIED+ACTIVE (surfaced at add-to-cart/checkout)
INSUFFICIENT_INVENTORY         409  requested quantity exceeds onHand - reserved at reservation time
PRICE_CHANGED                  -    non-blocking CheckoutValidationIssueDto, not an exception
COMPATIBILITY_REVIEW_REQUIRED  -    non-blocking CheckoutValidationIssueDto, not an exception
SAFETY_CONFLICT                400  a POTENTIAL_SAFETY_CONFLICT line exists and acknowledgeSafetyConflict wasn't set
CART_EMPTY                     400  checkout attempted against a cart with no lines
CHECKOUT_EXPIRED                410  payment attempted after checkout.expiresAt; reservation released
PAYMENT_FAILED                  -    surfaced via PayCheckoutResultDto.paymentStatus, not an exception
PAYMENT_PENDING                202  createPaymentIntent/pay against a checkout still PAYMENT_PENDING
PAYMENT_ALREADY_COMPLETED      409  pay() called again on an already-CONFIRMED checkout
ORDER_NOT_FOUND                404  no such order, or it belongs to a different user (never a 403 — no IDOR leak)
CHECKOUT_NOT_FOUND             404  no such checkout, or it belongs to a different user
```

## Real Payments + BNPL + Refund Basics + Reconciliation (Handoff 07)

Schema: `prisma/migrations/20260902000000_real_payments_bnpl_ledger`
(purely additive — generated via `prisma migrate diff` against the edited
schema, then hand-appended with four `CHECK` constraints Prisma's DSL
can't express: positive `installmentCount`/`totalPayableAmount` on
`FinancingPlanSnapshot`, positive `amount` on `Refund`, positive `amount`
on `LedgerEntry`). New enums: `PaymentMethodType`, `FinancingIntentStatus`,
`FinancingEligibilityStatus` (not persisted — computed from
`FinancingIntentStatus`), `RefundStatus`, `ProviderEventStatus`,
`LedgerAccountCode`, `LedgerEntryDirection`; `PaymentProvider` gained
`STANDARD_GATEWAY`/`SNAPP_PAY`/`DIGI_PAY`; `CheckoutStatus` gained
`PAYMENT_SUCCEEDED_ORDER_ISSUE`. New models: `FinancingIntent`,
`FinancingPlanSnapshot`, `Refund`, `PaymentProviderEvent`,
`ReconciliationLog`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`.

### Provider adapter architecture — never a hard-coded `if (provider === ...)`

`PaymentGateway` (`charge`/`getStatus`/`refund`/`verifyWebhookSignature`,
plus `readonly provider`/`readonly capabilities`) is the interface every
direct-payment provider implements; `FinancingProvider`
(`authorize`/`getStatus`/`refund`/`verifyWebhookSignature`, with
`checkEligibility`/`getPlans` deliberately **optional** methods) is a
wholly separate interface for installment providers — the two are never
unified into one "payment" interface, mirroring spec section 6's "do not
collapse into one payment status" at the type-design level, not just the
database level. `PROVIDER_CAPABILITIES` (`ProviderCapabilities`:
`supportsDirectPayment`/`supportsInstallments`/`supportsRefund`/
`supportsPartialRefund`/`supportsAsyncWebhook`/`supportsEligibilityCheck`)
is a single static map consulted everywhere — `CheckoutService`,
`getPaymentOptions`, the consumer UI's method-selection screen — instead
of branching on provider identity. `PaymentGatewayRegistry`/
`FinancingProviderRegistry` resolve `PaymentProvider → adapter instance`
and gate on the matching `*_ENABLED` env flag, throwing
`PAYMENT_PROVIDER_UNAVAILABLE`/`FINANCING_NOT_AVAILABLE` for a
disabled/unknown provider before a durable `PaymentIntent`/
`FinancingIntent` row is ever created for it.

### Provider documentation status (spec section 10 — never invent an endpoint)

No merchant account, API credentials, or official integration docs exist
for any real provider in this project. Rather than scrape or guess at
undocumented behavior, every non-`DEV_SIMULATED` adapter is built as a
documented sandbox stub, with its own class-level doc comment stating
exactly what is real and what is a documented gap:

- **`StandardGatewayAdapter`** (provider-neutral "real gateway" slot,
  spec section 7): `charge()` resolves synchronously from a caller-supplied
  `mode` (`SUCCESS`/`FAILURE`/`PENDING`) exactly like `DevPaymentGateway`,
  since there is no live gateway to redirect to — this is the one
  documented gap. `verifyWebhookSignature()` is **not** a stub: it
  implements a real HMAC-SHA256 check against `STANDARD_GATEWAY_API_KEY`
  when one is configured (falls back to always-accept when unconfigured,
  which is the sandbox's honest default), so the signature-verification
  *mechanism* is genuinely exercised even though no live provider ever
  signs a real payload with it here.
- **`SnappPayAdapter`/`DigiPayAdapter`**: official docs source, auth
  mechanism, sandbox availability, required credentials, webhook
  signature scheme, idempotency support, and reconciliation/status-query
  capability are all explicitly marked UNKNOWN in each adapter's doc
  comment. `checkEligibility()`/`getPlans()`/`authorize()`/`refund()` are
  illustrative-only, `mode`-driven sandbox behavior (3/6/12-installment
  plans at a flat 2% fee for SnappPay; 4/8-installment for DigiPay — both
  purely illustrative numbers, not real provider terms).
  `verifyWebhookSignature()` always accepts (real scheme UNKNOWN — never
  faked as "verified"). `SnappPayAdapter` is the only provider with
  `checkEligibility` (`capabilities.supportsEligibilityCheck: true`);
  `DigiPayAdapter` has no such method at all — `FinancingService`
  never fakes an eligibility check for it, it skips straight to plans/
  authorization per spec section 12. Neither provider claims
  `supportsPartialRefund` (spec: "never claim partial refund support for
  SnappPay/DigiPay unless official docs confirm it").

### BNPL: `FinancingIntent`, kept separate from `PaymentIntentStatus`

`FinancingIntent` (`CREATED → ELIGIBILITY_PENDING → ELIGIBLE/NOT_ELIGIBLE →
PLAN_SELECTED → AUTHORIZATION_PENDING → APPROVED/DECLINED`, plus
`CANCELLED`/`EXPIRED`/`REFUND_PENDING`/`PARTIALLY_REFUNDED`/`REFUNDED`) is
its own state machine — a `FinancingIntent` never reaches `CAPTURED` or
any other `PaymentIntentStatus` value, and `PaymentIntent` never gains a
BNPL-specific status. `FinancingPlanSnapshot` stores the selected plan's
`installmentCount`/`downPaymentAmount`/`installmentAmount`/`feeAmount`/
`totalPayableAmount`/`firstDueAt` at selection time — never re-read from
mutable provider plan data later, so a plan a customer agreed to can't
silently change underneath them. `FinancingService.createIntent()` is
idempotent per checkout+provider (reuses a non-terminal existing intent);
`checkEligibility()`/`getPlans()`/`selectPlan()`/`authorize()` mirror
`PaymentsService`'s create→act→resolve shape exactly, against
`FinancingIntent`'s own state instead of `PaymentIntentStatus`.
Server-side `authorize()` is authoritative (spec section 14: "never
confirm Orders solely from browser return parameters") — the sandbox
`mode` parameter is a dev-only convenience for exercising every outcome
deterministically, documented as something a real integration would omit
entirely in favor of the provider's own redirect/webhook outcome.

### Webhook + callback: authoritative vs. UX-signal-only, and real idempotency

`PaymentWebhooksController` (deliberately declared inside `CheckoutModule`
rather than `PaymentsModule`/`FinancingModule`, since it's the one place
both `PaymentsService` and `FinancingService` can be injected together
without a module import cycle) exposes `POST /payments/webhooks/:provider`
(authoritative — no `SessionAuthGuard`, since a real gateway calls this
unauthenticated as itself, authenticated only by its own signature) and
`GET /payments/callback/:provider` (pure read, UX-signal-only, never
writes state — the frontend's redirect/processing screens call this only
to render a hint, never to confirm anything). The actual duplicate-
delivery guard is `PaymentProviderEvent`'s `@@unique([provider,
providerEventId])` constraint: `ProviderEventsService.recordIfNew()`
attempts the insert first and catches the resulting `P2002` as the
duplicate signal — checked *before* any `PaymentIntent`/`FinancingIntent`
mutation is even attempted, so a replayed webhook is acknowledged
(`{received: true, processed: false, duplicate: true}`) without touching
financial state a second time. Raw payloads are deliberately never stored
(`payloadHash` only — spec section 17: "prefer redaction/minimal
retention"). `resolvePendingIntent()`/`resolveAuthorization()` are the
same idempotent resolve methods a webhook, a reconciliation check, and (for
the synchronous sandbox happy path) the direct `pay()`/`authorize()` call
all funnel through — never three separate code paths for one outcome.

### Refund basics — full refund only, no seller settlement yet

`RefundsService` (spec sections 23-26) is a consumer/dev convenience
surface, not a real dispute workflow: any signed-in owner of the order can
request a refund (no admin/support role model exists yet), and only a
full refund of the order total is supported — a partial `amount` is
rejected with `REFUND_NOT_SUPPORTED` regardless of provider, since no
provider here has a confirmed partial-refund capability. `refundPayment()`
and `refundFinancing()` are genuinely separate code paths (spec: "BNPL
refund must not be treated identical to a card refund") — the financing
path stores the provider's own reported outcome verbatim and never
computes an installment-schedule adjustment itself. `RefundsService` also
backs the emergency recovery path for spec section 21's "Paid but order
cannot confirm": if `CheckoutService.finalizeSuccessfulPayment()`'s
order-creation transaction throws after money has already moved (e.g. the
inventory reservation expired in the gap between payment and
confirmation), the checkout moves to the explicit
`PAYMENT_SUCCEEDED_ORDER_ISSUE` state and `refundForUnconfirmedCheckout()`
is attempted automatically (with `orderId: null`, since no `Order` exists
to attach it to) — if even that throws, the checkout stays flagged for
manual follow-up via `getOpsView`, rather than retrying silently forever
or hiding behind a generic `FAILED`.

### Reconciliation — resolves disagreements by replaying the same resolve path

`ReconciliationService` never writes `PaymentIntent`/`FinancingIntent`
status directly — `reconcilePaymentIntent()`/`reconcileFinancingIntent()`
call the gateway/provider's `getStatus()`, map the canonical remote status
(`PENDING`/`AUTHORIZED`/`CAPTURED`/`FAILED`/`CANCELLED`/`UNKNOWN` for
payments; `APPROVED`/`DECLINED`/`PENDING`/`CANCELLED`/`UNKNOWN` for
financing — `UNKNOWN` stays explicit, never silently treated as any other
state), and when local is still pending and remote has resolved, drive it
through the exact same `resolvePendingIntent()`/`resolveAuthorization()` a
real webhook would use. Every check appends one `ReconciliationLog` row
regardless of outcome — including a plain `NONE` action when local and
remote already agree, and `UNKNOWN_REMOTE_STATE` when there's no provider
reference to query yet — so "was this ever checked?" is always answerable
from data, not just from a log line. No scheduler exists yet (spec: "no
full scheduler required yet this phase") — `POST
/payments/reconcile/:paymentIntentId` and `POST
/financing/reconcile/:financingIntentId` are manual/job-friendly triggers.

### Double-entry ledger — application-enforced balancing, IRR integers only

`LedgerService.recordBalanced()` is the sole write path for
`LedgerTransaction`/`LedgerEntry`: it computes `sum(debits)` and
`sum(credits)` across the entries it's about to write and throws before
writing anything if they don't match exactly — enforced in application
code rather than a database `CHECK`, since "debits equal credits across
sibling rows" is inherently a multi-row invariant Postgres can't express
as a single-row constraint. Five seeded accounts
(`CASH_GATEWAY_RECEIVABLE`/`CUSTOMER_PAYMENT_CLEARING`/`SELLER_PAYABLE`/
`REFUND_PAYABLE`/`PLATFORM_REVENUE`), upserted idempotently on module
init. Two entry points are currently wired: `recordPaymentSucceeded()`
(debit `CASH_GATEWAY_RECEIVABLE` / credit `CUSTOMER_PAYMENT_CLEARING`),
called inside the same transaction as order confirmation for both a
standard payment and an approved BNPL intent — the same conservative
clearing-account treatment for both, since this phase makes no assumption
about a provider's specific settlement timing/fees; and
`recordRefundSucceeded()` (the exact reverse entries), called inside the
same transaction as the refund's own state update — never edited into the
original transaction, always a new, reversing one. `SELLER_PAYABLE`/
`PLATFORM_REVENUE` are seeded placeholders only; nothing posts to them
yet (no seller settlement this phase). IRR remains the one stored,
authoritative amount everywhere, including every `LedgerEntry.amount` — a
`CHECK (amount > 0)` constraint at the database level rejects a zero or
negative entry regardless of application-code correctness.

### Consumer UI (`apps/web/features/commerce/`)

Checkout gained a **Method** step between Review and Payment
(`getPaymentOptions` — capability-driven, never shows a disabled or
unsupported provider) branching into the existing dev-mode Payment step
(now provider-parameterized) or a new BNPL sub-flow: **Eligibility**
(skipped straight to Plans for a provider without the capability, per
spec section 12) → **Plans** (every plan always shows total payable, down
payment, per-installment amount, and fee — spec: "no hidden fees") →
**Authorize** (dev-mode approve/decline/pending buttons, mirroring the
standard Payment step) → **Declined** (non-shaming "Installment request
was not approved" with Try another provider / Retry / Return to cart —
never a dead end) or **Pending**/**Confirmation** exactly like the
standard flow. A checkout that commits to one method can still switch to
the other once that method's own attempt reaches a terminal failure
(declined/failed/cancelled/expired) — never while an attempt is still in
flight or after success — which is what makes the declined-BNPL "Pay
Online instead" and the standard-failure "Choose installments instead"
recovery actions actually work rather than just being unreachable UI
copy. My Orders and Order Detail now show **Payment status**,
**Financing status**, and **Refund status** as separate badges (per
order/refund row respectively) — never one collapsed status. Order Detail
gained a refund-request control (full refund only, matching the backend)
and doubles as a minimal payment receipt (amount/provider/reference/date/
status — not a tax invoice, since no legally-valid invoicing exists yet).
A new minimal internal ops view (`/checkout/:id/ops`, spec section 45 —
not a full Admin CRM) lists every `PaymentIntent`/`PaymentAttempt`/
`Transaction`/`FinancingIntent`/`Refund`/webhook event/reconciliation-log
row for a checkout, reachable only by that checkout's own owner (no
separate admin/support role model exists yet).

### API endpoints (Handoff 07 additions)

See the full endpoint list below (`GET /checkout/:id/payment-options`
through `POST /financing/reconcile/:financingIntentId`).

### Error codes (Handoff 07 additions)

```
PAYMENT_PROVIDER_UNAVAILABLE      503  provider disabled or unknown, resolved before any durable row is created
PAYMENT_AUTHORIZATION_FAILED      400  a standard-gateway charge attempt failed
PAYMENT_STATE_UNKNOWN             409  reserved for a genuinely unknown remote payment state (not yet thrown)
FINANCING_NOT_AVAILABLE           400  financing provider disabled or unknown
FINANCING_NOT_ELIGIBLE            400  reserved for a hard eligibility rejection (not yet thrown — see below)
FINANCING_DECLINED                -    surfaced via PayCheckoutResultDto.paymentStatus, not an exception (mirrors card FAILED)
FINANCING_EXPIRED                 410  authorization attempted after a FinancingIntent's expiresAt
INVALID_FINANCING_PLAN            400  select-plan called with a providerPlanId the adapter no longer offers
WEBHOOK_SIGNATURE_INVALID         400  verifyWebhookSignature() returned false for the delivered payload
REFUND_NOT_SUPPORTED              400  no captured payment/approved financing to refund, unsupported provider, or a partial amount requested
REFUND_FAILED                     400  the provider's own refund attempt reported failure
INVENTORY_CHANGED_AFTER_PAYMENT   -    reserved vocabulary for a future inventory-revalidation-after-payment case (not yet thrown)
PAYMENT_ORDER_CONFIRMATION_ISSUE  -    never thrown as a request-blocking error — surfaced only as Checkout.PAYMENT_SUCCEEDED_ORDER_ISSUE
FINANCING_INTENT_NOT_FOUND        404  no such financing intent, or it belongs to a different user's checkout
REFUND_NOT_FOUND                  404  no such refund, or its order belongs to a different user
```

## Delivery & Logistics Core (Handoff 08)

Schema: `prisma/migrations/20260902120000_delivery_logistics_core`
(purely additive, generated via `prisma migrate diff`, then hand-appended
with three `CHECK` constraints Prisma's DSL can't express: positive
`priceIrr` on `ShippingQuote`, positive `sequenceNumber` on `Fulfillment`
and `Shipment`). New enums: `ShippingProvider` (`DEV`/`ALOPEYK`/
`SNAPPBOX`), `FulfillmentType` (`STANDARD_DELIVERY` only, extensible),
`FulfillmentStatus`, `ShipmentStatus`, `ShippingQuoteStatus`. New models:
`ShippingQuote`, `Fulfillment`, `Shipment`, `ShipmentEvent`.

### Domain relationship: `Order → Fulfillment → Shipment`, schema-ready for a future split

`Fulfillment`/`Shipment` both carry a `sequenceNumber` (always `1` this
phase) behind a `@@unique([orderId, sequenceNumber])`/
`@@unique([fulfillmentId, sequenceNumber])` constraint — the exact same
idempotency device `Order.@@unique([checkoutId, sellerOrganizationId])`
already used (Handoff 06): a P2002 on a concurrent duplicate-create
attempt is caught and the existing row reused, and a later handoff can
introduce a genuine second Fulfillment/Shipment (`sequenceNumber: 2`) for
a split shipment without a migration. Each seller's `Order` owns exactly
one `Fulfillment` this phase; `Fulfillment.status` is the coarse
lifecycle (`PENDING → AWAITING_SELLER_PREPARATION → READY_FOR_PICKUP →
PICKUP_REQUESTED → PICKUP_ASSIGNED → PICKED_UP → IN_TRANSIT →
OUT_FOR_DELIVERY → DELIVERED`, or `FAILED`/`CANCELED`), `Shipment.status`
is the canonical, provider-normalized courier-job status
(`CREATED/REQUESTED/ASSIGNED/PICKED_UP/IN_TRANSIT/OUT_FOR_DELIVERY/
DELIVERED/FAILED/CANCELED/UNKNOWN`) — Order status, Payment status,
Fulfillment status, and Shipment status all stay separate state
machines; nothing overloads `Order.status` with shipping detail.

### Checkout-time `ShippingQuote`, deliberately scoped to `checkoutId` + `sellerOrgId`, not `orderId`

The spec's own suggested `ShippingQuote` shape carries an `orderId`, but
an `Order` does not exist until payment is confirmed ("1 Checkout → N
Orders", Handoff 06) — while shipping options must be requestable and
selectable *before* payment so the checkout total is server-recalculated
first. `ShippingQuote` is therefore keyed on `(checkoutId, sellerOrgId)`
(mirroring `InventoryReservation`'s own `checkoutId`+`sellerOfferId`
scoping) with a nullable `orderId`, backfilled once the matching seller's
`Order` is created — a deliberate, documented adaptation, not a deviation
taken lightly. `ShippingOrchestrator.selectShippingQuote()` is
concurrency-safe (`updateMany({ where: { status: AVAILABLE } })` claims
the row atomically) and idempotent (re-selecting the same quote is a
no-op); selecting a *different* quote for the same seller un-selects the
old one first, inside one transaction. Selecting any quote switches that
checkout's `deliveryAmount`/`totalAmount` from the prior flat
`DeliveryMethod`-based amount (Handoff 06, unchanged for any checkout
that never touches this flow) to the sum of each seller's currently
`SELECTED` quote — recalculated server-side, never trusting a client-
supplied shipping price. At Order-creation time, each seller's `Order`
now gets *its own* quote-driven `deliveryAmount` (a pre-existing Handoff
06 simplification — every seller previously received the full flat
amount — fixed as part of this handoff via an additive, optional
parameter on `OrdersService.createForCheckout()`, never touching its
existing call sites' behavior when no quote was ever selected). A
`SELECTED` quote that has since expired is rejected at
`createPaymentIntent()`/`createFinancingIntent()` time (`
SHIPPING_QUOTE_EXPIRED`) — "if a quote expires before payment: reject →
refresh/reselect, never silently substitute another provider/price."

### `ShippingGateway` — never a hard-coded `if (provider === ...)`, mirroring Handoff 07's payment adapters exactly

`ShippingGateway` (`getQuote`/`createShipment`/`cancelShipment`/
`getShipmentStatus`/`handleWebhook`, plus `readonly provider`/`readonly
capabilities`) is the one interface every provider implements.
`SHIPPING_PROVIDER_CAPABILITIES` (`supportsQuote`/`supportsCancel`/
`supportsWebhook`/`supportsStatusQuery`/`supportsTracking`) is a single
static map, consulted everywhere instead of branching on provider
identity. `ShippingProviderRegistry` resolves `ShippingProvider →
adapter instance` and gates on the matching `*_ENABLED` env flag,
throwing `SHIPPING_PROVIDER_DISABLED`/`SHIPPING_PROVIDER_UNAVAILABLE`
before any Shipment row is created for a disabled/unknown provider.

### Provider documentation status — no official AloPeyk/SnappBox docs exist for this project

Exactly the same discipline as Handoff 07's `SnappPayAdapter`/
`DigiPayAdapter`: no official AloPeyk or SnappBox merchant/API
documentation, credentials, or sandbox was available to this project.
Rather than invent an endpoint shape, auth mechanism, or webhook
signature scheme, all three providers share one generic, clearly-labeled
deterministic simulation engine (`shipping-simulation.util.ts` — no
randomness in price/ETA/expiration, only opaque ids use `randomUUID()`):

- **`DevShippingAdapter`** is fully functional and the one provider the
  entire logistics domain is provably testable against with no external
  credentials — including a dev/test-only webhook simulator
  (`buildSimulatedEventPayload()`) that feeds a synthetic event through
  the *real* `POST /shipping/webhooks/dev` pipeline rather than mutating
  state directly, so tests genuinely exercise webhook ingestion, not a
  shortcut around it.
- **`AloPeykAdapter`/`SnappBoxAdapter`** each carry an extensive
  class-level doc comment marking official docs source, auth mechanism,
  sandbox availability, credentials, webhook signature scheme, idempotency
  support, cancel capability, and reconciliation/status-query capability
  as explicitly UNKNOWN. Every method delegates to the same simulation
  engine as `DevShippingAdapter` — proving the registry/orchestrator
  boundary genuinely supports a third/fourth provider with zero
  `Order`/`Checkout`/`Fulfillment` code changes — while never presenting
  a simulated field or status value as a real AloPeyk/SnappBox API value.
  If `SHIPPING_MODE=production` and one of them is enabled, every method
  instead returns an explicit "production integration not yet
  implemented" result — it never silently falls back to the simulation
  under a production flag. Reserved env vars
  (`ALOPEYK_API_BASE_URL`/`ALOPEYK_API_KEY`/`ALOPEYK_WEBHOOK_SECRET`,
  `SNAPPBOX_*` equivalents) exist for whenever real credentials/docs
  become available; unused by either adapter today.
- **`normalizeShippingProviderStatus(provider, rawStatus)`**
  (`shipping-status-normalizer.ts`) has one explicit, tested mapping per
  provider (DEV's own lowercase snake_case vocabulary; AloPeyk/SnappBox
  use the same illustrative shape, explicitly marked as placeholders, not
  confirmed real values) — an unrecognized raw status always maps to
  `UNKNOWN` and is logged, never interpreted as success.

### Fulfillment state machine — one authoritative transition policy

`FulfillmentTransitionService.transition()` is the only code path that
ever writes `Fulfillment.status`. A request to the fulfillment's current
status is an idempotent no-op; a request to leave a terminal status
(`DELIVERED`/`FAILED`/`CANCELED`) or take an edge the transition table
doesn't allow is rejected with `FULFILLMENT_INVALID_TRANSITION`, never
silently ignored or forced through. `CANCELED` is reachable from every
state up to and including `PICKUP_ASSIGNED` (mirrors `Shipment`'s own
`CREATED`/`REQUESTED`/`ASSIGNED` cancel-eligibility); `FAILED` is
reachable from every courier-facing state. Only the customer-relevant
milestones (`READY_FOR_PICKUP`, `FAILED`, `CANCELED`) publish their own
domain event — the courier-driven mirrors are already covered by the
matching `Shipment.*` event fired alongside them, avoiding duplicate
consequential events on a replayed webhook.

### `ShippingOrchestrator` — quotes, Fulfillment/Shipment creation, and seller-ops actions, without an `OrderService` rewrite

Never imports `CheckoutModule`/`OrdersModule` (avoiding the same kind of
import cycle Handoff 07's `PaymentsModule`/`FinancingModule` sidestepped)
— every read/write goes through `PrismaService` directly with its own
ownership checks, exactly like `RefundsService` does for `Order`.
`CheckoutService.finalizeSuccessfulPayment()` calls
`createFulfillmentsForOrders()` inside the same transaction that creates
Orders — one Fulfillment per seller Order, immediately auto-transitioned
to `AWAITING_SELLER_PREPARATION`. The "request courier" ops action is
also where `Shipment` creation happens, and is the concurrency-critical
path (spec's Race A: "two concurrent createShipment calls → one canonical
Shipment → one external create intent"): the `Shipment` row is inserted
(claiming `sequenceNumber: 1`) **before** the provider is ever called, so
two concurrent calls race on the DB unique constraint rather than both
reaching the provider — only the winner calls `gateway.createShipment()`;
the loser reuses its result (see the e2e Race A test for the exact
timing subtlety this uncovered: the loser may briefly observe the row
before the winner's own async provider call has finished populating
`trackingCode`/`providerShipmentId` — both responses always resolve to
the same Shipment `id`, which is the actual invariant that matters, not
byte-identical response bodies). If `gateway.createShipment()` itself
fails, no Fulfillment transition happens at all — `READY_FOR_PICKUP` is
left untouched, and a genuine ops retry is just calling the same action
again, no state to undo. Seller-ops actions (`mark ready for pickup`,
`request courier`, `cancel`, `reconcile`) are owner-authorized only this
phase — no `SellerUser`/team-membership auth model exists yet (see Known
limitations); `ShippingOrchestrator`'s methods are already the seller-
scoped services a future Seller OS (Handoff 09) would call directly.

### Webhooks + `ShipmentEvent` — idempotent ingestion mirroring `PaymentProviderEvent`

`POST /shipping/webhooks/:provider` has no `SessionAuthGuard` (server-to-
server, authenticated by `gateway.handleWebhook()`'s own verification,
exactly like `POST /payments/webhooks/:provider`). `ShipmentEvent`'s
`@@unique([provider, providerEventId])` is the actual duplicate-delivery
guard — `ShipmentEventsService.recordIfNew()` attempts the insert first
and catches the resulting P2002 as the duplicate signal, checked *before*
any `Shipment`/`Fulfillment` mutation. When a provider event carries no
stable id, `ShipmentEventsService.fingerprint()` derives a deterministic
hash from `provider + providerShipmentId + eventType + occurredAt` —
never a bare random UUID, so a genuine replay of the same event is still
caught. An unknown `providerShipmentId` (no matching local `Shipment`) is
acknowledged (`{received: true, processed: false, reason:
"unknown_shipment"}`) without mutating anything or crashing the pipeline.
`ShippingOrchestrator.applyShipmentStatus()` is the one place a
`Shipment`'s canonical status is ever written after creation — both the
webhook controller and `ShippingReconciliationService` call it, never
mutating `status` directly. It enforces, in order: `UNKNOWN` is never
written over anything; a terminal local status is never overwritten
(the spec's own example — "Local: DELIVERED, Provider: IN_TRANSIT → keep
DELIVERED, record inconsistency" — is a dedicated e2e test); and a
non-terminal move must be forward-only along the canonical happy-path
ordering (`FAILED`/`CANCELED` are always "forward" from any non-terminal
state).

### Reconciliation — reuses `ShipmentEvent` as the audit log, never a second near-duplicate model

`ShippingReconciliationService.reconcileShipment()` never writes
financial/domain state itself — it always drives the exact same
`applyShipmentStatus()` a real webhook would, then appends one
`ShipmentEvent` row (`eventType: "reconciliation.checked"`) per check
regardless of outcome, reusing `ShipmentEvent`'s existing append-only
shape rather than introducing a `ShippingReconciliationLog` model
alongside the payment-side `ReconciliationLog` (they're intentionally
different tables since `ReconciliationLog.provider` is typed
`PaymentProvider`, not `ShippingProvider` — reuse without a type-widening
hack). No `providerShipmentId` yet, or a provider without
`supportsStatusQuery`, logs an explicit `UNKNOWN_REMOTE_STATE` rather
than guessing. `POST /orders/:orderId/shipment/reconcile` is a manual/
job-friendly trigger — no scheduler exists yet, matching Handoff 07's own
reconciliation endpoints.

### Financial integrity — server-authoritative shipping price, IRR integers only

The selected `ShippingQuote.priceIrr` is the sole authoritative shipping
price; the client can never supply one. `ShippingPackage` (weight in
grams, converted from `ProductVariant.weightValue`/`weightUnit`;
dimensions always `undefined` since this catalog has no length/width/
height data — never fabricated) is built from real order/reservation
data, never invented. No provider fee is ever assumed or invented for any
of the three simulated providers.

### Consumer UI (`apps/web/features/commerce/`)

Checkout gained a **Shipping** step between Review and Method — per
seller, delivery options deduplicated by service level (all three
providers currently return byte-identical price/ETA via the shared
simulation, so showing all of them individually would just look like
duplicate rows; provider identity itself is deliberately not shown, per
spec: "do not force customers to understand adapter/provider
architecture"), a refresh action, and an explicit unavailable state.
Selecting is optional — skipping proceeds with the prior flat delivery
amount, keeping every existing Handoff 06/07 checkout test's behavior
unchanged. Order Detail's Handoff 07-era "Fulfillment tracking coming
soon" placeholder is now the real thing: a status badge, tracking code,
ETA, and a fixed-checklist timeline (`reached`/pending milestones shown
as a static list, never a live-only feed) with a last-updated time, and
a friendly "temporarily unavailable" fallback rather than an error when
tracking can't be fetched. Order Confirmation shows the delivery amount
and each seller Order's current Fulfillment status with deliberately
non-alarming copy ("Seller is preparing your order") — never implying
courier assignment before it exists. My Orders shows Fulfillment status
as its own separate badge alongside Payment/Financing/Refund — never
collapsed into Order status.

### API endpoints (Handoff 08 additions)

See the full endpoint list below (`GET /checkout/:id/shipping-quotes`
through `POST /shipping/dev/simulate/:providerShipmentId`).

### Error codes (Handoff 08 additions)

```
SHIPPING_PROVIDER_UNAVAILABLE     503  resolved provider has no registered adapter
SHIPPING_PROVIDER_DISABLED        400  provider exists but its *_ENABLED flag is off
SHIPPING_QUOTE_NOT_FOUND          404  no such quote, or it belongs to a different checkout
SHIPPING_QUOTE_EXPIRED            410  quote's expiresAt has passed, at selection or at payment-intent time
SHIPPING_QUOTE_NOT_ELIGIBLE       400  reserved — quote/checkout mismatch beyond the 404 case above
SHIPPING_QUOTE_ALREADY_SELECTED   409  reserved for a future stricter re-selection policy (not yet thrown)
FULFILLMENT_NOT_FOUND             404  no such fulfillment, or its order belongs to a different user
FULFILLMENT_INVALID_TRANSITION    409  the requested status is unreachable from the fulfillment's current status
SHIPMENT_NOT_FOUND                404  reserved for a direct shipment lookup (not yet a standalone route)
SHIPMENT_ALREADY_EXISTS           409  reserved vocabulary — actual idempotency is the DB unique constraint, not this exception
SHIPMENT_CREATION_FAILED          502  the delivery provider's createShipment call failed
SHIPMENT_CANCEL_NOT_ALLOWED       409  reserved — cancelFulfillment currently no-ops rather than throwing on an ineligible shipment
SHIPMENT_PROVIDER_STATUS_UNKNOWN  409  reserved — UNKNOWN is currently absorbed silently by applyShipmentStatus/reconciliation, never thrown
SHIPMENT_RECONCILIATION_FAILED    502  the provider's getShipmentStatus call itself threw
SHIPPING_WEBHOOK_INVALID          400  gateway.handleWebhook() reported the payload invalid
```

## API endpoints

```
POST   /auth/request-otp
POST   /auth/verify-otp
POST   /auth/logout
GET    /auth/session

GET    /me
PATCH  /me

POST   /households
GET    /households
GET    /households/:id
PATCH  /households/:id

GET    /households/:householdId/pets
POST   /households/:householdId/pets           (Idempotency-Key supported)

GET    /pets/:id
PATCH  /pets/:id
POST   /pets/:id/photo-upload-url
GET    /pets/:id/access

GET    /households/:householdId/active-pet
PUT    /households/:householdId/active-pet

GET    /onboarding
PUT    /onboarding/progress
POST   /onboarding/complete                     (Idempotency-Key supported)

GET    /home

GET    /pets/:petId/health/summary
PATCH  /pets/:petId/health/profile
GET    /pets/:petId/health/allergies
POST   /pets/:petId/health/allergies
PATCH  /pets/:petId/health/allergies/:id
DELETE /pets/:petId/health/allergies/:id
GET    /pets/:petId/health/conditions
POST   /pets/:petId/health/conditions
PATCH  /pets/:petId/health/conditions/:id
GET    /pets/:petId/health/medications
POST   /pets/:petId/health/medications
PATCH  /pets/:petId/health/medications/:id
GET    /pets/:petId/health/vaccination-summary
PUT    /pets/:petId/health/vaccination-summary
GET    /pets/:petId/nutrition
PUT    /pets/:petId/nutrition
GET    /pets/:petId/care-profile
PUT    /pets/:petId/care-profile

GET    /providers/vets
GET    /providers/vets/:providerId
GET    /providers/vets/:providerId/availability

GET    /services/categories
GET    /providers/services
GET    /provider-services/:serviceId
GET    /provider-services/:serviceId/availability

POST   /addresses
GET    /addresses

POST   /booking-holds
POST   /bookings                                (Idempotency-Key supported)
GET    /bookings
GET    /bookings/:id
POST   /bookings/:id/cancel
POST   /bookings/:id/recur
GET    /care-calendar

GET    /provider/me/context
PUT    /provider/me/context
GET    /provider/me/overview

GET    /provider/availability/rules
POST   /provider/availability/rules
PATCH  /provider/availability/rules/:id
DELETE /provider/availability/rules/:id
GET    /provider/availability/exceptions
POST   /provider/availability/exceptions        (acknowledgeConflict to proceed past AVAILABILITY_CONFLICT)
PATCH  /provider/availability/exceptions/:id
DELETE /provider/availability/exceptions/:id

GET    /provider/bookings                       (today, upcoming, past, cancelled, category, locationId, providerUserId)
GET    /provider/bookings/:id
POST   /provider/bookings/:id/confirm
POST   /provider/bookings/:id/cancel
POST   /provider/bookings/:id/check-in
POST   /provider/bookings/:id/start
POST   /provider/bookings/:id/complete
POST   /provider/bookings/:id/notes             (internal-only BookingProviderNote)

GET    /provider/services
GET    /provider/services/:id
PATCH  /provider/services/:id                   (OWNER role only)

GET    /provider/team

GET    /shop/categories
GET    /shop/products                           (category, species, search, petId filters)
GET    /shop/products/:id                       (petId optional — missing Active Pet never blocks browsing)
GET    /shop/products/:id/offers

GET    /cart
POST   /cart/items                              (Idempotency-Key supported)
PATCH  /cart/items/:id
DELETE /cart/items/:id
DELETE /cart

POST   /checkout                                (Idempotency-Key supported; acknowledgeSafetyConflict to proceed past SAFETY_CONFLICT)
GET    /checkout/:id
PATCH  /checkout/:id
POST   /checkout/:id/revalidate
POST   /checkout/:id/payment-intent             (Idempotency-Key supported; provider: DEV_SIMULATED|STANDARD_GATEWAY)
POST   /checkout/:id/pay                        (Idempotency-Key supported; mode: SUCCESS|FAILURE|PENDING, dev only)
GET    /checkout/:id/payment-options             (capability-driven — never lists a disabled/unsupported provider)
POST   /checkout/:id/financing-intent           (provider: SNAPP_PAY|DIGI_PAY)
GET    /checkout/:id/financing-intent/:financingId
POST   /checkout/:id/financing-intent/:financingId/eligibility
GET    /checkout/:id/financing-intent/:financingId/plans
POST   /checkout/:id/financing-intent/:financingId/select-plan
POST   /checkout/:id/financing-intent/:financingId/authorize  (Idempotency-Key supported; mode: APPROVE|DECLINE|PENDING, dev only)
GET    /checkout/:id/ops                        (internal payment/financing inspection — owner-only)

POST   /payments/webhooks/:provider             (no session/CSRF — server-to-server; dev_simulated|standard_gateway|snapp_pay|digi_pay)
GET    /payments/callback/:provider             (read-only UX signal — never confirms an order)
POST   /payments/reconcile/:paymentIntentId
POST   /financing/reconcile/:financingIntentId

GET    /orders
GET    /orders/:id
POST   /orders/:orderId/refunds                 (Idempotency-Key supported; full refund only this phase)
GET    /orders/:orderId/refunds
GET    /refunds/:id

GET    /checkout/:id/shipping-quotes            (per-seller options; requests fresh quotes on first call)
POST   /checkout/:id/shipping-quotes/refresh
POST   /checkout/:id/shipping-quotes/select     (Idempotency-Key supported; re-selecting the same quote is a no-op)
GET    /orders/:orderId/fulfillment
GET    /orders/:orderId/shipment
GET    /orders/:orderId/tracking                (Fulfillment + Shipment + fixed-checklist timeline)
POST   /orders/:orderId/fulfillment/ready-for-pickup     (owner-authorized seller-ops action — no Seller OS auth yet)
POST   /orders/:orderId/fulfillment/request-courier      (Idempotency-Key supported; creates the Shipment)
POST   /orders/:orderId/fulfillment/cancel
POST   /orders/:orderId/shipment/reconcile
POST   /shipping/webhooks/:provider             (no session/CSRF — server-to-server; dev|alopeyk|snappbox)
POST   /shipping/dev/simulate/:providerShipmentId  (dev/test-only; hard-disabled outside development/test via NODE_ENV)

PUT    /uploads/:token   (local-dev-only fallback target for photo uploads)
GET    /health/live
GET    /health/ready
```

Errors always look like:

```json
{ "error": { "code": "PET_ACCESS_DENIED", "message": "...", "details": {}, "requestId": "..." } }
```

## Local development

### Prerequisites

- Node 20+, pnpm 10+
- Docker (for Postgres/Redis/MinIO) — or point `DATABASE_URL`/`REDIS_URL` at
  instances you already have running.

### Setup

```bash
pnpm install
pnpm infra:up                    # postgres, redis, minio via docker-compose

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm db:migrate                  # prisma migrate dev
pnpm db:seed                     # Sarah + Luna (Golden Retriever, vaccination
                                  # due soon, no known allergies, complete diet
                                  # profile, partial care profile) + Milo (DSH,
                                  # unknown vaccination, unknown allergies,
                                  # minimal care profile) + Tehran Pet Care
                                  # Clinic (VERIFIED, Dr. Sara Vet, General Vet
                                  # Visit/Vaccination/Follow-up, available
                                  # every day 09:00-18:00 Asia/Tehran) + one
                                  # VERIFIED provider per remaining category
                                  # (Happy Paws Grooming, Good Dog Training,
                                  # City Paws Walking, Cozy Home Sitting,
                                  # Tehran Pet Boarding, PetGo Taxi), each with
                                  # one service and the same daily availability
                                  # + Commerce Core: 2 VERIFIED sellers (Pet
                                  # Bazaar Tehran, Golestan Pet Supplies) + 1
                                  # SUBMITTED seller (never discoverable) +
                                  # 5 products across Food/Treats/Grooming/
                                  # Accessories (Royal Canin Adult Dog Food —
                                  # dog-only + CHICKEN allergen, Royal Canin
                                  # Kitten Food — cat-only + maxAge 12mo,
                                  # naturally NOT_RECOMMENDED for the 18mo
                                  # Milo, Grain-Free Training Treats —
                                  # unrestricted, Calming Grooming Wipes —
                                  # requiresHealthReview, Soft-Sided Travel
                                  # Carrier — sold by both VERIFIED sellers)

pnpm dev                         # api on :4000, web on :3000
```

Open `http://localhost:3000` — it redirects to `/fa/home` (default locale),
which redirects unauthenticated visitors to `/fa/welcome`. The OTP code is
never sent anywhere in dev — it's printed in the API's log
(`[DEV OTP] identifier=... code=...`).

### Scripts

```bash
pnpm dev          # both apps, watch mode
pnpm build        # turbo build (shared packages first, then api/web)
pnpm lint         # turbo lint
pnpm typecheck    # turbo typecheck
pnpm test         # turbo test (unit + component tests; see below for e2e)
pnpm db:migrate   # prisma migrate dev
pnpm db:seed      # seed script

# API e2e (needs its own DB — see below):
pnpm --filter @petlife/api test:e2e
```

### Testing

- **Unit tests** (`apps/api/src/**/*.spec.ts`, run by `pnpm test`): OTP
  identifier classification, session cookie signing/tamper-detection, Home
  ranking rules.
- **Frontend unit tests** (`apps/web/**/*.test.{ts,tsx}`, Vitest +
  Testing Library): locale/RTL config, theme persistence, and — new in
  Handoff 02 — component-level tests rendered against the app's real `en`/`fa`
  message catalogs (`apps/web/test/render-with-intl.tsx`): Health Overview's
  single-primary-attention hierarchy and its never-collapsed Known
  Negative/Unknown/Known Present labels, Vaccination Summary rendering
  `UNKNOWN` and `INCOMPLETE` as distinct from `OVERDUE`, Care Profile's
  read-only-vs-editable rendering by permission, and a Persian-locale RTL
  test asserting a Latin drug name + numeric dosage ("Apoquel — 16 mg")
  renders untouched inside a `dir="auto"` element regardless of the
  surrounding page direction — plus, new in Handoff 03: a pure-function suite
  for `formatAppointmentDateTime`/`formatDateKey` asserting the Persian
  locale renders Jalali (year `۱۴۰۵`, no `2026` anywhere) while English
  renders Gregorian for the exact same instant, and that a slot is grouped by
  its calendar date *in the provider's timezone*, not UTC; Find Vet rendering
  a verified badge, its services, and next-available time, plus empty/
  no-availability states; the Booking wizard walking Slot Picker → Review →
  Health Sharing end to end (mocked services) and asserting the Who/What/
  Why/Until-When permission copy and all three scope presets render; and
  Booking Detail rendering the just-confirmed banner, a confirmed booking's
  shared-health-access summary, and a cancelled booking's status label with
  no Cancel action offered. New in Handoff 04: Explore Services rendering a
  tile per category with the active pet's name; Service Results showing a
  verified badge and every compatibility status (`COMPATIBLE`/
  `NEEDS_REVIEW`) with its reason never hidden, plus an empty state; the
  generalized Service Booking Wizard walking a fixed-slot (Grooming) flow
  through Review → Care Sharing (asserting the category-specific preset
  copy, not a vet-only one), a date-range (Boarding) flow asserting
  `createHold` is called with `rangeStart`/`rangeEnd` instead of `slotStart`,
  and an `AT_CUSTOMER` (Walking) flow asserting the Address step is inserted
  before Review with Continue disabled until an address is chosen; the
  generalized Booking Detail (now `features/bookings/`) rendering a
  check-in–check-out range instead of a single time for a multi-day
  Boarding booking and offering "Repeat weekly" only for a recurring-eligible
  category with no series yet; and My Bookings rendering the Upcoming tab by
  default and switching to Cancelled with its own empty state. New in
  Handoff 05: Provider Home's all-clear vs. attention-count states and its
  today/next-booking rows; the Bookings queue's filter switching and empty
  state; Booking Detail rendering all four `access.state` values distinctly
  (asserting Care context renders while Health context does not when the
  grant excludes it, and that `NO_GRANT` never renders either), the
  Confirm/Check-in/Start/Complete action bar advancing one state at a time,
  and the cancel dialog submitting the entered reason; the Provider Shell's
  not-a-provider message, its multi-organization picker, and its
  not-verified banner; Availability's explicit
  conflict-acknowledge-and-proceed flow; and smoke tests for the Schedule
  tab switch, the Services active/disable toggle, and the Team roster. New
  in Handoff 06: `formatCurrency` asserting the IRR→Toman ÷10 display
  transform rounds rather than truncates and never renders a fractional
  Toman; Product Card rendering price/brand without ever labeling anything
  "best" and surfacing a `POTENTIAL_SAFETY_CONFLICT` with an urgent tone
  rather than hiding it; Product Results scoping its search call to the
  active pet and rendering an empty state; Product Detail re-scoping the
  offer list when a different variant is selected and calling
  `addCartItem` with the selected offer/quantity/active-pet-id; Cart
  rendering one group per seller, a price-changed flag without trusting
  the stale total, a safety-conflict banner, and a per-line remove action;
  Checkout walking address → review → payment and asserting all three
  payment outcomes (success routes to Confirmation with the returned order
  ids, pending never calls `router.push`, failure shows the
  cart-preserved copy with a working retry) plus the explicit
  acknowledge-and-retry flow for a `SAFETY_CONFLICT` response; Order
  Confirmation rendering each seller's Order as its own block; My Orders
  and Order Detail rendering an order's own fields (never re-derived
  solely from a Checkout) including its immutable product/variant/price
  snapshot and target pet; and Shop Home rendering categories and a
  discovery list scoped to the active pet with no ranking language. New in
  Handoff 07: Checkout's Method step routing an `ONLINE_PAYMENT` capability
  straight to the existing Payment step and an `INSTALLMENTS` capability
  through Eligibility → Plans → Authorize, asserting a BNPL approval routes
  to Order Confirmation with the returned order id and a decline renders
  the non-shaming "Installment request was not approved" screen with a
  working "Try another provider" action (never `router.push`); Order
  Detail rendering Payment status and Financing status as separate,
  never-collapsed badges and a refund request updating to show the
  resulting `SUCCEEDED` status; and a smoke test for the internal
  Checkout Ops view rendering a checkout's payment intents and an explicit
  empty state for every record type with none.
- **API e2e tests** (`apps/api/test/app.e2e-spec.ts`, Supertest against a
  real Nest app + Postgres + Redis): OTP → session, IDOR denial on a pet the
  user has no `PetAccessGrant` for, household + pet creation with optional
  fields skipped, Luna→Milo active-pet switching reflected in `/home`,
  onboarding resume, and an idempotent pet-creation retry — plus a
  `"schema hardening"` block covering the checkpoint above: two independent
  grants union rather than overwrite, an expired temporary grant doesn't
  affect a standing one, a revoked grant stops authorizing immediately,
  onboarding progress survives its referenced pet/household being deleted
  (`SET NULL`, row intact), a duplicate NULL-pet `UserPetInterest` is
  actually rejected now, active-pet selection is denied both for a pet
  outside the target household and for a real household member with no
  effective grant, and a user with neither email nor phone is rejected at
  the DB layer (the `CHECK` constraint, not just app validation) — plus a
  `"Health Basics + Care Profile (Handoff 02)"` block: IDOR denial on both
  the health and care-profile endpoints for a user with no active grant,
  Known Negative vs. Unknown staying distinct (and becoming Known Present
  once a real row exists) across repeated `PATCH /health/profile` calls,
  creating an allergy and a medication (and the medication count only
  counting `ACTIVE` ones), a declared `UNKNOWN` vaccination never reading
  back as `OVERDUE`, updating the Care Profile through `NOT_STARTED` →
  `PARTIAL` → `COMPLETE`, Home ranking `VIEW_VACCINATION` as primary when
  due soon, Home never surfacing a health action to a caller granted
  identity-only access (added to the household *after* the pet already
  existed, so `applyHouseholdDefaults` never ran for them), the Health
  summary staying scoped to whichever pet is queried when switching between
  Luna and Milo, onboarding resuming into the `HEALTH_BASICS` chapter, and
  onboarding completing successfully when every Health Basics question was
  left unanswered — plus a `"Find a Vet + Vet Booking Basics (Handoff 03)"`
  block: only `VERIFIED` providers are returned by default, a booking hold
  is rejected with `PET_NOT_SUPPORTED` when the service doesn't support the
  pet's species, availability generation produces a real 30-minute
  `AVAILABLE` slot, confirming against a hold that no longer exists reports
  `HOLD_EXPIRED`, a second hold on an already-confirmed slot is rejected
  with `SLOT_UNAVAILABLE`, a retried confirmation with the same
  `Idempotency-Key` produces exactly one `Booking` row, a booking is
  recorded against the pet that was actually held (not just any pet in the
  household), a booking hold is denied to a user with no active access to
  the pet (IDOR), confirming creates a `TEMPORARY` grant for the assigned
  vet without altering the household's own grants, cancelling a booking
  revokes that specific grant, an expired temporary grant stops
  authorizing, a confirmed booking projects into `GET /care-calendar` and
  disappears from it once cancelled, Home surfaces `VIEW_BOOKING` once
  Health Basics are otherwise complete, switching the active pet away from
  the one with the booking never surfaces it on Home, reading a booking is
  denied to a user with no active access to its pet, and the vet's
  temporary grant is gated at exactly `canViewHealth`/`canEditHealth` — view
  succeeds, edit is still denied — plus a `"Services Marketplace Basics
  (Handoff 04)"` block: `GET /services/categories` returns the full
  canonical taxonomy; only `VERIFIED` providers are returned when
  discovering non-vet services; a species-incompatible service reports
  `NOT_SUPPORTED` on the detail endpoint *and* rejects the hold with
  `PET_NOT_SUPPORTED`; a service requiring an incomplete Care Profile
  reports `NEEDS_REVIEW` (not a hard block); `SlotGeneratorService` is
  genuinely reused (a real `AVAILABLE` slot comes back for a non-vet
  service); holding and confirming a Grooming booking grants
  `GROOMING_BASIC` (Care Profile only, `canViewHealth: false`) to the
  assigned staff member; the household's own `HOUSEHOLD`-sourced grants are
  byte-for-byte unaffected (same row ids, same flags) by that new grant;
  cancelling revokes the grant and a second, independently-authenticated
  session (the groomer's own account, verified via a real `GET` for the
  pet's Care Profile) loses access; a booking hold is denied to a user with
  no access to the pet (IDOR); `GET /bookings` isolates by household/user
  and the new `cancelled` filter returns exactly the cancelled set while
  `upcoming` excludes it; Home surfaces `VIEW_BOOKING` with a
  `home.action.viewBooking.grooming` label for a non-vet category; a
  confirmed Grooming booking projects into the Care Calendar as
  `GROOMING_APPOINTMENT`; a multi-day Boarding hold is created from
  `rangeStart`/`rangeEnd`, confirms with `startAt`/`endAt` matching exactly,
  projects that same range into the calendar, and a second, genuinely
  overlapping Boarding request at the same location is rejected with
  `SLOT_UNAVAILABLE` (the DB `EXCLUDE` constraint is the real guarantee, not
  just this check); `POST /bookings/:id/recur` creates independent weekly
  occurrences sharing one `bookingSeriesId`, and cancelling one occurrence
  leaves the series `ACTIVE` and every sibling occurrence still `CONFIRMED`;
  a second pet's Care Profile stays fully inaccessible to a groomer granted
  access only to the first pet, and that second pet's booking list stays
  empty; and an address is required only for a service whose `LocationMode`
  actually needs one (`AT_PROVIDER` succeeds with none, `AT_CUSTOMER` is
  rejected with `ADDRESS_REQUIRED` until one is created and supplied) —
  plus a `"Minimal Provider OS (Handoff 05)"` block: a user with no
  `ProviderUser` membership is denied Provider OS access entirely; a
  provider from Organization A is denied (`403`, never `404`) access to
  Organization B's booking; a provider's booking queue contains only their
  own organization's bookings; Care context renders while Health context
  is withheld exactly when the booking's grant excludes it, with health
  data never even queried in that case; a booking created with no assigned
  `providerUserId` shows `NO_GRANT` (no grant exists for anyone); confirm
  is idempotent from `CONFIRMED` and rejects confirming an already-cancelled
  booking; cancelling updates `bookingStatus` to `CANCELLED_BY_PROVIDER`,
  revokes that booking's own grant, and updates Care Calendar/Home exactly
  like the consumer-side cancel path; check-in → start → complete advance
  one step at a time and a skipped transition (e.g. `start` before
  `check-in`) is rejected with `INVALID_BOOKING_TRANSITION`, including
  after `COMPLETED` is reached; availability rules can be created, updated,
  and deleted; a `BLOCKED` exception overlapping a confirmed booking is
  rejected with `AVAILABILITY_CONFLICT` and the booking is provably
  untouched, then the same request with `acknowledgeConflict: true`
  succeeds and the booking remains `CONFIRMED`; disabling a service blocks
  new booking holds (`SERVICE_NOT_AVAILABLE`) while leaving an existing
  confirmed booking untouched, and is rejected for a `STAFF`-role provider
  with `PROVIDER_ACCESS_DENIED` before an `OWNER` successfully disables it;
  the team roster is isolated per organization; a user with more than one
  `ProviderUser` membership is denied with `AMBIGUOUS_CONTEXT` until they
  explicitly choose via `PUT /provider/me/context`, after which
  `GET /provider/me/overview` reflects the chosen organization; and a
  booking's canonical ISO timestamps are byte-identical regardless of the
  viewing provider's own `locale` (`fa` vs. `en`) — plus a `"Commerce Core
  (Handoff 06)"` block: discovery returns Product/Variant/Offer as
  genuinely distinct objects; an unverified seller's offer never appears
  in discovery and adding it to a cart is rejected; raw Prisma updates
  that would push `reserved` above `onHand` or `onHand` below zero are
  rejected by the database's own `CHECK` constraints, not just application
  code; the compatibility engine reports a species mismatch, an
  unrestricted product as `LIKELY_COMPATIBLE`, and a `requiresHealthReview`
  product as `NEEDS_REVIEW` until Health Basics is complete; two pets in
  the same household get fully independent compatibility results for the
  same product; targeting a pet the caller has no access to is denied
  (IDOR); a cart line can be added, its quantity updated, and removed; a
  cart with offers from two sellers groups into two separate seller
  blocks; a price increase since a line was added is flagged without the
  response trusting the stale snapshot for the total; a checkout request
  exceeding available inventory is rejected before any reservation is
  made; a successful checkout creates a real `InventoryReservation` row
  inside the same transaction; a checkout whose `expiresAt` has passed is
  rejected at payment time and its reservation is released; a simulated
  successful payment confirms the checkout, creates the Order(s), and
  consumes the reservation; a simulated failed payment leaves the cart and
  reservation untouched and a subsequent retry on the same checkout
  succeeds; a checkout left `PAYMENT_PENDING` creates no Order until a
  webhook call to `POST /payments/webhooks/dev_simulated` resolves the
  intent, at which point the Order is created; a single multi-seller
  Checkout produces exactly one `Order` per seller; an `Order`'s
  product/variant/price snapshot is provably unchanged even after the
  underlying Product and Offer are mutated post-purchase; calling `pay()`
  again on an already-`CONFIRMED` checkout returns `409
  PAYMENT_ALREADY_COMPLETED` rather than consuming inventory or creating
  Orders twice; reading another user's order returns `404
  ORDER_NOT_FOUND` (never a 403 that would confirm the order exists); every
  commerce amount asserted throughout the suite is a plain JavaScript
  integer, never a fractional IRR value; a product with a matching active
  allergy is blocked at checkout with `409 SAFETY_CONFLICT` until
  `acknowledgeSafetyConflict: true` is sent, after which it succeeds; and
  the cart is converted only once payment is confirmed, never merely at
  checkout creation — plus a `"Real Payments + BNPL + Refund Basics +
  Reconciliation (Handoff 07)"` block: `GET /checkout/:id/payment-options`
  lists exactly the enabled providers with their real capability flags
  (`SNAPP_PAY.supportsEligibilityCheck: true`,
  `DIGI_PAY.supportsEligibilityCheck: false`) and never a disabled one; a
  checkout paid through `STANDARD_GATEWAY` confirms exactly like
  `DEV_SIMULATED` (proving the provider is chosen via the adapter
  registry, never hard-coded); `GET /payments/callback/:provider` is
  proven read-only — calling it while a payment is `PENDING` creates no
  Order and leaves the checkout `PAYMENT_PENDING`; a duplicate webhook
  delivery (same `eventId`) is acknowledged as `{duplicate: true}` without
  creating a second Order, a second `LedgerTransaction`, or reprocessing —
  `PaymentProviderEvent.attemptCount` increments instead of a new row
  being created; `StandardGatewayAdapter.verifyWebhookSignature()`
  genuinely rejects a forged signature and accepts a correctly-computed
  HMAC once a secret is configured; a full BNPL flow (create financing
  intent → eligibility `ELIGIBLE` → plans, each with an integer
  `totalPayableAmount` strictly greater than the checkout total → select
  plan → authorize `APPROVE`) confirms the Order and records a balanced
  ledger transaction (`sum(debits) === sum(credits) === totalAmount`); a
  `DECLINE` authorization confirms no Order and leaves `FinancingIntent`
  `DECLINED` with the checkout still recoverable — proven by then
  switching the *same* checkout to `DEV_SIMULATED` online payment and
  succeeding (the payment-method-switch guard genuinely permits recovery
  after a terminal failure, not just before any attempt); DigiPay's
  eligibility endpoint returns `ELIGIBLE` immediately rather than faking a
  real check, since the adapter has no `checkEligibility` method; a
  `PENDING` financing authorization creates no Order until a webhook to
  `POST /payments/webhooks/digi_pay` resolves it, at which point
  `FinancingIntent` becomes `APPROVED` and the Order is created; a full
  refund on a confirmed order returns `SUCCEEDED`, flips the Order to
  `REFUNDED`, and records a reversing ledger transaction that is itself
  balanced; a partial refund amount is rejected with
  `REFUND_NOT_SUPPORTED`, as is refunding an already-refunded order;
  reconciliation logs an explicit `NONE` action (with an audit row) when
  local and remote already agree, `UNKNOWN_REMOTE_STATE` when there is no
  provider reference yet to query, and `RESOLVED_SUCCEEDED` — confirming
  the Order exactly once, including against a second, redundant
  reconciliation check — when local is `PENDING` and the provider's own
  remote state has since resolved; every financing plan amount for an
  odd (non-round) checkout total is asserted to stay a plain integer; and
  reading another user's financing intent or checkout ops view returns
  `404 CHECKOUT_NOT_FOUND` (IDOR).

  The e2e suite needs its own database (kept separate from your dev data):

  ```bash
  createdb -O petlife petlife_os_test   # or: psql -c "..." if createdb isn't available
  DATABASE_URL="postgresql://petlife:petlife@localhost:5432/petlife_os_test?schema=public" \
    pnpm --filter @petlife/api exec prisma migrate deploy
  pnpm --filter @petlife/api test:e2e
  ```

  (`apps/api/test/jest-env-setup.js` points the suite at
  `petlife_os_test` by default; override with `TEST_DATABASE_URL` if needed.
  Rate limiting is bypassed in `NODE_ENV=test` via `ThrottlerModule`'s
  `skipIf` — supertest has no real network layer, so many users signing up
  in one test file from the same "IP" would otherwise trip production rate
  limits.)

CI (`.github/workflows/ci.yml`) runs install → build shared packages →
generate Prisma client → lint → typecheck → migrate → unit+component tests →
e2e tests → build, against real Postgres/Redis service containers.

- **Browser E2E (Handoff 02, manual verification against a real Chromium)**:
  the full spec flow — sign up → verify OTP → create a household → create
  Luna → Health Basics (No known allergies → Add later ×2 → vaccination Due
  soon → diet Dry food) → Personalization → Home (asserted `VIEW_VACCINATION`
  as the primary action, with an href built from Luna's real pet id) → Pet
  Profile (Health teaser shows "Due soon") → Health Overview (primary
  attention block + "None known" allergy state) → Vaccination Summary
  (`DUE_SOON` selected) → Care Profile (not-set-up state) → add Milo via My
  Pets → switch active pet to Milo → re-check Home (no longer shows Luna's
  vaccination action; the primary action's href now points at Milo's pet id)
  → Milo's own Health Overview (`Incomplete`, not Luna's `None known`) — all
  15 checkpoints passed, explicitly confirming that switching the active pet
  never leaks one pet's health data into another's context.

- **Browser E2E (Handoff 03, manual verification against a real Chromium)**:
  signed in as Sarah with Luna active (Health Basics pre-cleared via direct
  API calls, since the ranking rules deliberately never let an ordinary
  booking outrank a due vaccination or an incomplete health setup — see
  "Home ranking changes" above) → Find a Vet → opened the verified "Tehran
  Pet Care Clinic" → General Vet Visit → Booking Wizard showed real
  generated slots → picked one → Review Booking (clinic/service/location/
  time shown) → Health Sharing (explicitly selected "Health Basics
  (recommended)", with the Who/What/Why/Until copy all present) → Confirm
  booking → landed on Booking Detail with the just-confirmed banner and the
  shared health-access summary → the booking appeared in the Care Calendar
  → Home surfaced "View upcoming vet visit" as the primary action → in a
  second, independently signed-in browser context as the assigned vet
  (`dr.sara.vet@example.com`), a real `GET` for Luna's health summary
  returned `200` (the temporary grant genuinely works, not just a DB row)
  → cancelled the booking from Booking Detail → status changed to
  "Cancelled by you" → the booking disappeared from the Care Calendar → the
  same vet session's next `GET` for Luna's health summary returned `403`
  (grant revoked) → Home no longer showed the booking → switched the active
  pet to Milo and confirmed Milo's Pet Profile never showed Luna's
  (cancelled) booking teaser — all 18 checkpoints passed.

- **Browser E2E (Handoff 04, manual verification against a real Chromium)**:
  signed in as Sarah with Luna active (Health Basics pre-cleared via direct
  API calls, same rationale as Handoff 03) → Explore Services → Grooming →
  Service Results showed the verified "Happy Paws Grooming" with Luna's
  compatibility shown as "Compatible" (never hidden) → opened its Booking
  Wizard → real generated slots → picked one → Review Booking → Care
  Sharing showed the Grooming-specific "Grooming basics" preset (not a
  vet-only one) → Confirm booking → Booking Detail with the just-confirmed
  banner → the booking appeared in the Care Calendar as "Grooming
  appointment" → Home surfaced "View upcoming grooming" (the
  category-specific label, not the vet-only string) as the primary action →
  in a second, independently signed-in browser context as the groomer's own
  staff account (`groomer@example.com`), a real `GET` for Luna's Care
  Profile returned `200` while a `GET` for her health summary returned
  `403` (the temporary grant is genuinely Care-Profile-only, never health
  data by default for a non-vet category) → cancelled the booking → status
  changed to "Cancelled by you" → the booking disappeared from the Care
  Calendar → the same groomer session's next `GET` for the Care Profile
  returned `403` (grant revoked) → Home no longer showed the booking → then
  a second flow: Explore Services → Boarding → opened the verified "Tehran
  Pet Boarding" → chose a check-in and a check-out date (a genuine multi-day
  range, no slot grid) → Review Booking rendered a check-in–check-out date
  range rather than a single time → Care Sharing showed the
  Boarding-specific preset → Confirm booking → the multi-day booking
  appeared in the Care Calendar rendering its full date range, not a single
  timestamp → switched the active pet to Milo and confirmed Milo's Pet
  Profile never showed Luna's Grooming or Boarding booking context — all 28
  checkpoints passed.

- **Browser E2E (Handoff 05, manual verification against a real Chromium)**:
  three flows against a live API/web server, real Postgres/Redis. **Flow
  1** — signed in as the assigned vet (`dr.sara.vet@example.com`) → Provider
  Home showed "Tehran Pet Care Clinic" and today's vet booking for Luna →
  opened it → Care context and Health context both visible (`GRANTED`, not
  a silently hidden state — the vet-category grant includes health) →
  Confirm (success message) → Check in → Start → Complete with an
  owner-visible completion note → status persisted across a page reload →
  switched to Sarah's own browser context and confirmed her Booking Detail
  showed the same `Completed` status and the identical completion note.
  **Flow 2** — a second, future-dated vet booking: confirmed it showed on
  Sarah's Home ("View upcoming vet visit") and Care Calendar before
  cancellation → the vet provider-cancelled it with a reason → status
  became `Cancelled by provider` → the API confirmed
  `CANCELLED_BY_PROVIDER` → Sarah's Care Calendar entry count dropped by
  one and Home no longer surfaced it as the primary action → verified via
  the Provider OS API that *this* booking's own access grant is now
  `REVOKED` while the unrelated, already-completed first booking's own
  grant is untouched (each booking holds its own independent grant, per
  spec). **Flow 3** — signed in as a different organization's staff
  (`groomer@example.com`) and navigated directly to the vet clinic's
  booking detail URL → denied with "You do not have access to this
  booking." in the UI and `403 PROVIDER_ACCESS_DENIED` from the API (never
  a silent 404) — all 29 checkpoints passed.

- **Browser E2E (Handoff 06, automated Playwright run against a real
  Chromium, live api/web dev servers, and a freshly-seeded Postgres)**:
  four flows, all passing. **Flow 1** — signed in as Sarah with Luna
  active → Shop → opened Royal Canin Adult Dog Food (`Compatible` for
  Luna, a dog) → Add to cart → Cart showed the product → Checkout →
  created a new address inline (the household had none yet) → Review →
  simulated a successful payment → landed on Order Confirmation showing
  `Confirmed` → My Orders showed the same order as its own record with a
  `Confirmed` status, not merely re-derived from the checkout. **Flow 2**
  — added Grain-Free Training Treats (Pet Bazaar Tehran's only offer) and
  Calming Grooming Wipes (Golestan Pet Supplies' only offer) to the cart →
  Cart correctly grouped the two lines under their two separate sellers →
  Checkout review still showed both seller groups → one simulated
  successful payment produced **exactly two** separate `Confirmed` Order
  blocks on the Confirmation page, one per seller — proving "1 Checkout →
  N Orders" end to end. **Flow 3** — added the Soft-Sided Travel Carrier →
  simulated a failed payment → the Payment Failed screen showed the
  non-alarming "nothing was charged, your cart has been preserved" copy →
  navigating back to the cart confirmed the line was still there → retried
  checkout on the same cart with a successful payment → the Confirmation
  page showed **exactly one** `Confirmed` Order, proving the earlier
  failed attempt left no orphaned or duplicate Order. **Flow 4** — with
  Luna active, opened Royal Canin Adult Dog Food and confirmed
  `Compatible` (a dog, no allergy conflict) → switched the active pet to
  Milo via the Home switcher → revisited the exact same product URL →
  the page now showed "Shopping for Milo" (no leftover Luna label) and
  `Not recommended` (species mismatch — the product is dog-only) — proving
  compatibility genuinely recomputes per pet with no context leak. This
  run also caught and fixed a real, pre-existing race in `HomeView`'s
  active-pet refetch (see Known limitations) that was silently returning
  the *previous* active pet's Home data for a few seconds after every
  switch — a bug this handoff's own flow 4 requirement is what surfaced it.

- **Browser E2E (Handoff 07, automated Playwright run against a real
  Chromium, live api/web dev servers, and a freshly-seeded Postgres)**: all
  5 required flows passing. **Flow A (Standard Payment)** — signed in as
  Sarah → Shop → added a product → Cart → Checkout → Method screen showed
  "Pay online" and "SnappPay" (never a disabled provider) → chose Pay
  online → simulated a successful payment → landed on Order Confirmation
  showing "Confirmed" → the order was independently visible via
  `GET /orders` with `status: CONFIRMED`. **Flow B (BNPL Approved)** —
  same cart → Method → SnappPay → Eligibility screen showed "You're
  eligible for installments" → Plans showed a real installment count/total
  payable → selected a plan → Confirm installment plan → simulated
  approval → Order Confirmation → the order's `financingStatus` was
  `APPROVED` via the API. **Flow C (BNPL Declined)** — identical up to
  Confirm installment plan → simulated a decline → the non-shaming
  "Installment request was not approved" screen rendered with both "Try
  another provider" and "Return to cart" present → clicked "Try another
  provider" → landed back on the Method screen (not stuck) → chose Pay
  online on the *same* checkout and reached the Payment step — proving the
  decline-recovery path genuinely works end to end, not just in isolated
  unit tests. **Flow D (Duplicate Webhook)** — Checkout → Pay online →
  simulated a pending payment → captured the `PaymentIntent` id via the
  new Ops view (`GET /checkout/:id/ops`) → posted the identical webhook
  payload twice to `POST /payments/webhooks/dev_simulated` — the first
  delivery returned `processed: true`, the second returned
  `duplicate: true` — then confirmed via `GET /orders` that exactly one
  Order existed and the Checkout page itself showed "Order confirmed"
  after the (single, non-duplicated) confirmation. **Flow E (Refund)** —
  opened the Flow A order's Order Detail page → submitted a refund request
  with a reason → the UI updated to show the refund's status as
  "Refunded" → independently confirmed via the API that the `Refund` row
  was `SUCCEEDED` and the `Order.status` had flipped to `REFUNDED`. This
  run caught and fixed a real bug: `Order.status` reaching `REFUNDED` had
  no `en`/`fa` translation (Handoff 06 only ever reached
  `PENDING`/`CONFIRMED`/`CANCELLED`), which threw a console
  `MISSING_MESSAGE` error on Order Detail, My Orders, and Order
  Confirmation until fixed.

## What's implemented

Everything in the acceptance criteria of the coding handoff: Persian
(default, RTL) and English (LTR) locales; light/dark/system theme; dev-OTP
auth with resend cooldown, expiry, and attempt limiting; household creation;
pet creation with all optional fields skippable; resumable onboarding; a pet
automatically becoming Active Pet on first creation; My Pets with Active Pet
switching that updates Home without a reload; a minimal editable Pet Profile;
IDOR-safe authorization via `PetAccessGrant`; unit + e2e tests for the
critical paths; a CI pipeline; a documented local setup; and the schema
hardening checkpoint above (DB-level contact-info `CHECK`, `SET NULL` FK
policy for onboarding, NULL-safe `UserPetInterest` uniqueness, the
grant-based authorization model, microchip normalization, `Pet.deletedAt`
prep, and transactional-outbox columns on `domain_events`).

Everything in the Handoff 02 acceptance criteria: Health Basics (Allergies,
Conditions, Medications, Vaccination summary) with Known Present/Known
Negative/Unknown/Incomplete always kept distinct; Diet/nutrition basics; a
free-text Care Profile with permission-aware read-only rendering;
`canViewHealth`/`canEditHealth`/`canViewCareProfile`/`canEditCareProfile`
enforced through the existing grant-union algorithm (no separate
authorization path); a `HealthSummaryService` that is the only thing Home and
Pet Profile ever read (never raw domain rows); a permission-aware
`HomeRankingService` rule chain (vaccination due → health incomplete → care
incomplete + `DAILY_CARE` interest → fallback) that never surfaces health
data to a caller without `canViewHealth`; a Health Basics onboarding chapter
that never forces a full medical intake and never conflates "skipped" with an
explicit negative answer; full Persian/English localization including
mixed-content ("Apoquel 16 mg")-safe RTL rendering; domain events for every
health/care mutation using the existing outbox-shaped infrastructure;
provenance (`sourceType`, `recordedByUserId`) preserved and never silently
overwritten; a forward-only migration; updated seed data for Luna (due-soon
vaccination, no known allergies, a complete diet profile, a partial care
profile) and Milo (unknown vaccination, unknown allergies, a minimal care
profile); backend + frontend unit/e2e tests for the scenarios above; and a
full manual browser E2E pass (see above) confirming Luna/Milo health-data
isolation end to end.

Everything in the Handoff 03 acceptance criteria: discovery of `VERIFIED`
vets only by default (`GET /providers/vets`), with a real vet profile,
deterministic slot generation from recurring availability rules plus one-off
exceptions (no ML, no external scheduling provider), Redis-backed slot holds
(`BOOKING_HOLD_TTL_SECONDS`, default 600s) that are never the source of
truth for booking history, a `Booking` state machine persisted in
PostgreSQL with a separate `PaymentStatus` state machine, double-booking
prevention enforced by partial unique indexes at the database level (not
just the hold or the slot generator), idempotent booking confirmation via
the existing `IdempotencyInterceptor`, temporary vet health access issued
through the same grant-union `PetAccessGrant` model used everywhere else
(source `TEMPORARY`, reason `VET_BOOKING`, expiring `endAt` +
`BOOKING_HEALTH_ACCESS_BUFFER_HOURS`, never mutating the household's own
grant), an explicit audit link (`BookingPetAccess`, generalized/renamed from
`BookingHealthAccess` in Handoff 04) between a booking and the grant it
created, cancellation that revokes the temporary grant and never deletes
the booking, a `CareCalendarEvent` projection that is created on confirm
and marked cancelled on cancel (the `Booking` row stays the only editable
source of truth), Jalali/Gregorian dual display built entirely on ICU
(`Intl.DateTimeFormat` with `-u-ca-persian`/`-u-ca-gregory`, no new date
library), a `HomeRankingService` rule for an upcoming confirmed booking that
never outranks a due vaccination or an incomplete health setup, a Pet
Profile "Upcoming vet visit" teaser, and a full manual browser E2E pass (see
above) confirming the temporary grant genuinely authorizes and is genuinely
revoked, that Luna's booking never leaks into Milo's context, and that
cancellation updates the booking, the grant, and the calendar consistently.

Everything in the Handoff 04 acceptance criteria: a canonical
`ServiceCategory` taxonomy discoverable via `GET /services/categories`;
non-vet provider/service discovery reusing the exact same
`ProviderOrganization`/`ProviderLocation`/`ProviderService`/
`SlotGeneratorService`/`BookingHoldService`/`Booking` engine Handoff 03
built (no second booking system); a deterministic, no-ML
`PetServiceCompatibilityService` that never reports a service compatible
when required context — species, age, weight, Care Profile, Health Basics —
is genuinely missing rather than actually disqualifying; Grooming,
Training, Walking, Sitting, Boarding, and Pet Taxi all representable
through the same `Booking`/`ServiceCategory`/`LocationMode` fields, with no
per-category table; temporary Care access issued through the same
grant-union `PetAccessGrant` model, Care-Profile-only by default per
category (never health data unless the category or an explicit choice
needs it); the household's own grant provably unaffected (same row,
`updatedAt` excluded) by a new category-specific grant; cancellation
revoking exactly the grant that booking created; Home and the Care Calendar
reacting to *any* category's upcoming booking with a category-specific
label/event type, never more than one action shown at once; multi-day
Sitting/Boarding bookings using the exact same `startAt`/`endAt` columns as
every fixed-slot category, with a real Postgres `EXCLUDE` constraint (not
just an application check) preventing two overlapping stays at the same
location; pet context fully isolated (a second pet's Care Profile stays
inaccessible to a groomer granted access only to the first, and its booking
list stays empty); Jalali and Gregorian both rendering correctly for
multi-day ranges via the same date-range helper used everywhere else; every
Handoff 01–03 backend/frontend test still green; and a full manual browser
E2E pass (see above) proving the Grooming and multi-day Boarding flows,
real temporary Care-Profile-only access and its revocation, and Luna/Milo
context isolation end to end.

Everything in the Handoff 05 acceptance criteria: a provider user entering
a dedicated Provider OS, seeing only their own organization's data
(bookings, team, services) with a `403 PROVIDER_ACCESS_DENIED` — never a
silent 404 — for anything belonging to a different organization; an
explicit organization-choice requirement (never inferred) for a user with
more than one `ProviderUser` membership; a booking queue and detail view
gated by the exact `BookingPetAccess` link that booking created, with four
explicit access states rather than a boolean that hides why; availability
CRUD over the existing Handoff 03 models with an explicit
acknowledge-and-proceed conflict flow that never silently cancels or moves
a booking; single-step `CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`
transitions (any other requested transition rejected) finally reaching
`BookingStatus` values that have existed in the vocabulary since Handoff
03; cancellation revoking exactly the temporary grant that booking
created and updating the Care Calendar/Home exactly as the consumer-side
cancel path does (same reused service methods, not a second
implementation); a minimal `OWNER`-only services admin surface where
disabling a service never cancels its future bookings; a completely
separate Provider Shell UI (own session bootstrap, own store, own route
group) that never mixes with consumer navigation; Jalali/Gregorian dual
calendar support via the exact same ICU helpers used everywhere else;
Persian RTL/English LTR and light/dark theming reused from the existing
design system; every Handoff 01-04 backend/frontend test still green; and
a full manual browser E2E pass (see above) proving a provider can sign in,
open a permissioned booking, walk it through
Confirm/Check-in/Start/Complete with the completion note visible on the
owner's side, cancel a different booking with the temporary grant
provably revoked and the owner's Care Calendar/Home updating, and a
provider from one organization being denied access to another
organization's booking end to end.

Everything in the Handoff 06 acceptance criteria: a strict
`Product → ProductVariant → SellerOffer → SellerOrganization` model with
`InventoryItem` as the sole (PostgreSQL, never Redis) authority for stock,
enforced by raw-SQL `CHECK` constraints preventing negative or
over-reserved inventory at the database layer; only `VERIFIED`+`ACTIVE`
sellers' offers ever discoverable or purchasable; a deterministic
`ProductCompatibilityService` that never defaults to `COMPATIBLE` when
data is missing and always ranks `POTENTIAL_SAFETY_CONFLICT` highest; a
persistent server-side `Cart` that always shows the live offer price with
an explicit "price changed" flag rather than trusting a stale snapshot;
`Checkout` that revalidates offer/seller/inventory/price/compatibility and
hard-blocks an unacknowledged safety conflict; a real, transactional
`InventoryReservation` with a documented 15-minute TTL, checked at
use-time rather than relying solely on background cleanup; a
`PaymentGateway` interface with `DevPaymentGateway` as its one real,
network-free implementation (`SUCCESS`/`FAILURE`/`PENDING` modes) plus a
webhook slot proven end-to-end for `dev_simulated`; "1 Checkout → N
Orders" enforced structurally via `Order.@@unique([checkoutId,
sellerOrganizationId])` and made idempotent via the same P2002-catch
pattern `BookingsService` already established; every `OrderItem`
preserving an immutable commercial snapshot even after the underlying
Product/Offer later changes; `Idempotency-Key` support on checkout
creation, payment-intent creation, and payment; five separate financial
state enums (never one giant one); IRR stored as a plain integer
everywhere, with Toman shown only via one documented display-only
÷10 transform; a full consumer Shop → Cart → Checkout → Order Confirmation
→ My Orders → Order Detail UI with no fake ratings, no "best price"
labeling, and no sponsored placement; a fixed, pre-existing race in
`HomeView`'s active-pet refetch found and corrected while validating the
"switch pet, compatibility recomputes" flow (see Known limitations); every
Handoff 01-05 backend/frontend test still green; and a full browser E2E
pass (see below) proving the full happy-path purchase, a multi-seller cart
producing two independent Orders from one Checkout, a simulated payment
failure that preserves the cart and permits a successful retry with no
duplicate Order, and a pet switch that correctly recomputes a product's
compatibility with no context leak.

Everything in the Handoff 07 acceptance criteria: a `PaymentGateway`/
`FinancingProvider` adapter architecture with a `STANDARD_GATEWAY`
provider-neutral real-gateway slot and honestly-documented `SnappPay`/
`DigiPay` sandbox stubs (no scraped or invented endpoints — every
UNKNOWN in each adapter's doc comment reflects a genuine absence of
official docs/credentials for this project); `FinancingIntent`/
`FinancingPlanSnapshot` kept structurally separate from
`PaymentIntentStatus`, never one collapsed status; a callback endpoint
that is provably read-only and a webhook endpoint that is the sole
authoritative confirmation path, with real `@@unique([provider,
providerEventId])`-backed duplicate-delivery idempotency (a replayed
webhook is acknowledged without a second Order, Transaction, or ledger
entry); the full BNPL eligibility → plans → authorize flow working
end to end for both an approval and a decline, with a genuinely
recoverable checkout afterward (a fixed gap where switching payment
methods was permanently blocked once committed was found and fixed
while proving this); refund basics (full refund only, a genuinely
separate BNPL-vs-card code path, and the emergency
`PAYMENT_SUCCEEDED_ORDER_ISSUE` recovery path for "paid but order cannot
confirm"); a reconciliation service that resolves a local/remote
disagreement by replaying the same idempotent resolve path a webhook
would, with an audit-friendly log row for every check regardless of
outcome; a double-entry ledger with application-enforced balancing
(`sum(debits) === sum(credits)`, checked before every write) recording
both a successful payment and its reversing refund; IRR remaining the
one stored, authoritative integer amount everywhere, including every new
`LedgerEntry`; a consumer UI that separates Payment/Financing/Refund
status into distinct badges and never shows "Order confirmed" before the
backend has actually confirmed it; a minimal internal payment/financing
ops view reachable only by a checkout's own owner; every Handoff 01-06
backend/frontend test still green; and a full browser E2E pass (see
above) proving a standard payment, an approved BNPL purchase, a declined
BNPL purchase that recovers to online payment on the same checkout, a
duplicate webhook delivery that produces no duplicate financial records,
and a full refund, all end to end against a real browser.

Everything in the Handoff 08 acceptance criteria: `Order → Fulfillment →
Shipment` as its own set of state machines, schema-ready (via the
`sequenceNumber`+unique-constraint device) for a future split-shipment
feature without a migration; a `ShippingGateway` adapter architecture
(`DEV`/`ALOPEYK`/`SNAPPBOX`) mirroring Handoff 07's payment adapters
exactly, with `DevShippingAdapter` fully functional and the other two
built as sandbox-honest, extensively-documented adapter boundaries (no
official AloPeyk/SnappBox docs exist for this project); checkout-time
`ShippingQuote` request/select/refresh/expiry, server-recalculating
`Checkout.deliveryAmount`/`totalAmount` and each seller `Order`'s own
quote-driven `deliveryAmount` (fixing a pre-existing Handoff 06
simplification along the way); `FulfillmentTransitionService` as the one
authoritative, terminal-protected, idempotent state-transition policy;
concurrency-safe Shipment creation (the DB unique constraint claims the
row before the provider is ever called, so two concurrent `request-
courier` calls never place two courier jobs); an idempotent webhook
pipeline (`ShipmentEvent`'s `@@unique([provider, providerEventId])`) plus
a dev-only webhook simulator that exercises the real pipeline, not a
shortcut around it; a reconciliation service that never regresses a
terminal local state and reuses `ShipmentEvent` as its own audit log;
Checkout/Order Detail/My Orders/Order Confirmation UI additions that keep
Fulfillment status strictly separate from Order/Payment/Financing/Refund
status; every Handoff 01-07 backend/frontend test still green (130 backend
e2e scenarios, 98 frontend tests); and backend e2e coverage for every
required flow (single-seller happy path to `DELIVERED`, independent
multi-seller Fulfillments, a post-pickup Shipment failure that leaves
Order/Payment independently coherent, quote expiration/refresh/reselect,
and the two required concurrency races) executed via the same real-HTTP
supertest-driven approach every prior handoff's "browser E2E" used.

## Known limitations / deliberate simplifications

- **CSRF** uses the double-submit cookie pattern rather than a signed
  synchronizer token — adequate for this phase, revisit if a wider attack
  surface (e.g. subdomains) is introduced later.
- **Domain events** are outbox-shaped (`domain_events` has `aggregateType`/
  `aggregateId`/`attemptCount`/`lastError`/`processedAt`, and pet/household/
  active-pet/onboarding-completion mutations publish inside the same
  `$transaction` as the write) but dispatch is still synchronous, in-process
  `EventEmitter2` — no separate relay/poller/queue yet. No further call-site
  or schema changes are needed to add one later.
- **Idempotency-Key** support is a Redis-cached-response strategy scoped to
  pet creation and onboarding completion, not a generic framework-level
  middleware.
- **Three constraints exist only as raw SQL in the migration**, not in
  `schema.prisma` (Prisma's DSL can't express them): the `users` contact-info
  `CHECK`, the two `user_pet_interests` partial unique indexes, and the
  `pets.microchipNormalized` partial unique index. A future `prisma migrate
  dev` may propose dropping them as "unmanaged drift" — see the schema
  hardening section above before applying a generated migration that
  touches those three tables.
- **No API surface for issuing non-household `PetAccessGrant`s yet** (no
  "invite a sitter", "grant vet access for 24h" endpoint) — the grant model
  and its enforcement are hardened, but only `HOUSEHOLD`-sourced grants are
  ever created today, via `applyHouseholdDefaults()` at pet-creation time.
- **`Pet.deletedAt` is unused** beyond being excluded from
  `PetsService.listForHousehold` — no archive/delete endpoint sets it yet;
  it's schema preparation for when one exists.
- **Object storage** defaults to a local-dev fallback (`STORAGE_DRIVER=local`)
  that streams uploads to disk through a one-time Redis-backed token; the
  S3/MinIO driver (`STORAGE_DRIVER=s3`) is implemented and wired into
  `docker-compose.yml` but not exercised by the automated tests.
- **Onboarding is one route** (`/[locale]/onboarding`) with an internal
  step wizard, not nine separate Next.js routes — chosen so the "resume
  after leaving mid-flow" behavior lives in one place (fetch progress, fetch
  the in-progress pet/household by id, jump to the right step) instead of
  being re-derived per route. The onboarding order also creates the Pet
  right after "Birthday/Age" (the last *required* field) rather than at the
  very end, since photo upload requires a pet id to exist; Photo/Breed/Sex
  are then progressively saved via `PATCH` and are all skippable.
- **Home** resolves "the current household" as the first one the user
  belongs to (by `createdAt`) — there's no explicit household switcher yet;
  multi-household support is a natural next step, not implemented here.
- **Accessibility**: components use semantic roles/labels, visible focus
  rings, `role="alert"` for errors, and `prefers-reduced-motion` handling
  globally — not independently audited with a screen reader.
- Full Vet marketplace/booking and a Minimal Provider OS are now in scope
  (see Handoffs 03-05 below), but the *full* Provider OS (payouts,
  settlements, refunds, provider analytics, full provider onboarding,
  document verification, clinical visit notes, EMR, AI Vet Scribe, labs,
  imaging, prescriptions, pharmacy, live GPS, maps, full customer
  messaging, photos/checklists, incident management, reviews, external PMS
  integrations) is not. AI Health, Commerce, Travel, Insurance, Community,
  Animal Support, and all Seller/Shelter/Admin surfaces remain explicitly
  out of scope, per the spec.
- **Handoff 02 is Health *Basics*, not the Health platform**: no labs,
  imaging, prescriptions, veterinary booking, AI Health, full medical
  timeline, or pharmacy. `HealthSeverity` beyond `ATTENTION`
  (`HIGHER_CONCERN`/`URGENT`/`EMERGENCY`) is defined but unwired — no logic
  ever assigns those values yet.
- **`SourceType.PROVIDER`/`IMPORTED_DOCUMENT`/`SYSTEM` are unreachable** —
  every write endpoint only ever produces `OWNER`-sourced records. There is
  no provider integration, document-import flow, or system-derived health
  fact yet; the field exists so adding one later doesn't require a migration.
- **`VIEW_MEDICATION` is a defined `HomeActionKind` with no ranking rule** —
  the vocabulary exists (per the spec's "structured ActionType" requirement)
  but nothing currently produces it as a primary or secondary action.
- **Home surfaces only one secondary action** (`secondaryActions[0]`) in the
  current `HomeView` UI — `HomeRankingService` can return a `COMPLETE_HEALTH`
  primary with a `COMPLETE_CARE_PROFILE` secondary at the same time (it leads
  the array precisely so a single-secondary-action consumer still shows it),
  but a future screen that wants to show *all* secondary actions needs its
  own UI, not a ranking change.
- **The only way to issue a `TEMPORARY` `PetAccessGrant` today is booking
  confirmation** (Handoff 03) — there's still no general-purpose "invite a
  sitter"/"share with anyone" endpoint; a household's own `HOUSEHOLD`-sourced
  grant is still the only other source, via `applyHouseholdDefaults()` at
  pet-creation time.
- **Nutrition has no dedicated permission flag** — `/pets/:petId/nutrition`
  is gated by `canViewHealth`/`canEditHealth` since the spec didn't request a
  separate one; revisit if nutrition data ever needs a different audience
  than the rest of Health Basics.
- **`PaymentStatus` never leaves `NOT_REQUIRED`** — no payment gateway
  integration exists yet; the state machine (`PENDING`/`AUTHORIZED`/`PAID`/
  `FAILED`/`REFUND_PENDING`/`REFUNDED`) is modeled and displayed separately
  from `BookingStatus` in the UI, but nothing ever transitions it.
- **`SELECTED_HEALTH_DATA` is not yet distinct from `HEALTH_BASICS`** —
  `BookingPetAccessService`'s `SCOPE_PRESET_FLAGS` maps both presets to
  the same permission flags today, since there's no per-field health-data
  selection UI yet; the preset is stored and shown correctly, it just
  doesn't (yet) grant a narrower or wider scope than Health Basics.
- **No reschedule** — `BookingStatus` has no `RESCHEDULED` state; a booking
  can only be cancelled and a new one created from scratch.
- **The Minimal Provider OS (Handoff 05) is real but deliberately narrow** —
  see the dedicated section above for what it covers. `ProviderUser` remains
  explicitly not a pet-data permission source (`PetAccessGrant`/
  `BookingPetAccess` remain the only source of truth for what a vet or
  other provider can see).
- **Appointment time is always shown in the provider's local timezone**, not
  converted to the viewer's device timezone — acceptable since bookings are
  currently Tehran-only via seed data, but a future handoff adding
  multi-timezone providers should show "provider local time" and "your
  time" side by side when they differ, per the spec.
- **`HOLD`/`PENDING_CONFIRMATION`/`NO_SHOW` remain unreachable** —
  `CHECKED_IN`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED_BY_PROVIDER` are now
  reachable via the Provider OS (Handoff 05); a hold is still Redis-only
  and a confirmed booking is still created directly at `CONFIRMED` (no
  real payment-authorization gate), so there is genuinely no persisted row
  to move through `HOLD`/`PENDING_CONFIRMATION`. `NO_SHOW` has no endpoint
  that sets it yet.
- **No cleanup job for expired temporary grants** — enforcement is
  request-time (`expiresAt` is checked on every authorization check), so an
  expired grant simply stops authorizing; it is never deleted or archived.
- **No geolocation/distance ranking** — `GET /providers/vets` filters by
  `city` as plain text; there's no lat/long-based "nearest clinic" sort, and
  the UI never fabricates a distance when location data is missing.
- **No series-wide cancel/pause endpoint** — `BookingSeries.status` supports
  `PAUSED`/`COMPLETED` in the vocabulary but only `ACTIVE`/`CANCELLED` are
  ever set (and nothing sets `CANCELLED` yet); the only way to affect a
  series today is cancelling occurrences one at a time via the existing
  `POST /bookings/:id/cancel`, which deliberately never touches the series
  row or any sibling occurrence.
- **No address update/delete endpoint** — `CustomerAddress` supports create
  and list only; an address referenced by any booking is `onDelete:
  Restrict`, so a delete endpoint would first need to decide what happens
  to that booking history, which is out of scope this phase.
- **`SELECTED_HEALTH_DATA`/`BOARDING_BASIC` are the only non-identity
  presets that ever include health data**, and neither offers field-level
  selection — every other category preset (`GROOMING_BASIC`/
  `TRAINING_BASIC`/`WALKING_BASIC`/`SITTING_BASIC`/`TAXI_BASIC`) is strictly
  Care-Profile-only, with no way to additionally share, say, just allergies
  for a specific booking.
- **Compatibility bounds are informational at hold-time, not enforced** —
  `PetServiceCompatibilityService`'s `NOT_SUPPORTED`/`NEEDS_REVIEW`/
  `UNKNOWN` statuses are surfaced on every discovery/detail screen, but
  `BookingsService.createHold()` only ever hard-blocks on species
  (`PET_NOT_SUPPORTED`) and a completely empty required profile
  (`PET_CONTEXT_INCOMPLETE`) — an age/weight mismatch does not itself block
  a hold or confirmation this phase.
- **Boarding/Sitting have no capacity/kennel-inventory model** — the
  provider-location-level `EXCLUDE` constraint prevents two overlapping
  stays at the same location entirely, which is correct for a
  single-capacity provider but would need a real inventory model (multiple
  concurrent kennels/rooms) to support a facility that can host more than
  one pet at once; out of scope per the spec ("do not build kennel
  inventory").
- **Two wizard components exist side by side** — `features/vet/BookingWizard`
  (vet-only, three fixed presets) and `features/services/ServiceBookingWizard`
  (every other category, one recommended preset per category, plus the
  date-range/address steps) were not merged into one component this phase,
  to avoid destabilizing the already-shipped, already-tested vet flow; both
  call the exact same backend endpoints.
- **Discovery has no "book directly from the Explore Services entry point"
  shortcut** — since the app has no persistent bottom navigation, `/services`
  is reached via a small card on Home (or direct navigation); a future
  handoff adding real navigation chrome should route through it instead.
- **"Today" in the Provider OS uses plain UTC calendar-day boundaries**,
  not the provider location's own timezone — acceptable since every seeded
  location is Tehran-only, but a future multi-timezone-provider handoff
  should compute "today" per-location like appointment times already are.
- **`ACCESS_EXPIRED` is part of the error vocabulary but not yet thrown** —
  `ProviderBookingDetailDto.access.state = "EXPIRED"` already surfaces a
  lapsed grant as a graceful 200 UI state (spec: "clear no-access states"),
  which covers the real product need; the exception class exists for API
  completeness in case a future endpoint needs to hard-block on it.
- **No invitation/deactivation flow for `ProviderUser`s** —
  `GET /provider/team` is read-only; adding a team member still means a
  direct `prisma.providerUser.create()` (via seed data or a future admin
  tool), and every listed member's `status` is always the literal
  `"ACTIVE"` since there's no way to deactivate one yet.
- **Availability conflict detection covers `BLOCKED` exceptions only** —
  changing a recurring `ProviderAvailabilityRule` never checks it against
  existing future bookings; reconciling a weekly rule change against every
  affected future booking is disproportionately complex for this phase
  (see the Stage 1 architecture review) and is deferred to a future
  handoff if it proves necessary.
- **Provider services admin cannot change `category`/`type`/
  `providerOrganizationId`/`locationId`** — only the fields listed in the
  Handoff 05 section above are editable; this is a minimal admin surface,
  not a full catalog-management workflow, per the spec.
- **No provider-side reschedule** — `check-in`/`start`/`complete`/`cancel`
  are the only booking transitions; moving a booking to a different slot
  still means cancelling and creating a new one.
- **`POST /provider/bookings/:id/confirm` is a no-op by construction, not
  a placeholder** — see the dedicated explanation in the Handoff 05
  section above; this isn't unfinished work, it's what "confirm" can
  correctly mean given this architecture's booking lifecycle.
- **No real merchant credentials for any payment/financing provider**
  (Handoff 07) — `StandardGatewayAdapter`/`SnappPayAdapter`/
  `DigiPayAdapter` are documented sandbox stubs (see the Handoff 07
  section above for exactly what's real vs. UNKNOWN per provider); no
  live redirect/authorization round-trip, real installment terms, or real
  webhook signature scheme exists for any of them. `DeliveryMethod`
  (`STANDARD`/`EXPRESS`) remains a flat, dev-calculated fallback amount
  (`DELIVERY_AMOUNT_BY_METHOD`) for any checkout that never touches the
  Handoff 08 shipping-quote flow; a checkout that does gets a real (if
  simulated) per-seller `ShippingQuote` price instead — see the Handoff 08
  section above for the delivery/logistics architecture that now exists.
  Torob/Digikala integration remains explicitly out of scope per the spec.
- **No seller-facing commerce surface, and no seller settlement** —
  sellers are seed-data-only this phase (`SellerOrganization`/
  `SellerOffer`/`InventoryItem` are all created via `prisma/seed.ts`);
  there is no seller dashboard, no seller order view, no seller-side
  inventory management endpoint, and nothing ever posts to the ledger's
  `SELLER_PAYABLE`/`PLATFORM_REVENUE` accounts (seeded placeholders only
  since Handoff 07). `docs/architecture` for the *full* Seller OS is a
  future handoff, mirroring how Provider OS (Handoff 05) followed the
  booking engine (Handoff 03).
- **No promotion engine** — `Checkout.discountAmount`/`promotionCode` are
  placeholder fields only; nothing ever sets a non-zero discount or
  validates a code this phase.
- **Refunds are full-only, consumer/dev-initiated, and never reach
  `PARTIALLY_REFUNDED`** (Handoff 07 implemented the rest) — `Refund`
  entities and a full `REFUND_NOT_SUPPORTED` rejection path for any
  partial amount exist and are exercised end to end, but no provider here
  has a confirmed partial-refund capability, so `OrderStatus.
  PARTIALLY_REFUNDED`/`FinancingIntentStatus.PARTIALLY_REFUNDED` stay
  unreachable; there is also no admin/support role model yet, so any
  signed-in owner of an order can request its refund (spec: "consumer
  refund initiation may be limited... implement internal/dev refund route
  and owner-visible status only").
- **Reconciliation has no scheduler** — `POST
  /payments/reconcile/:paymentIntentId`/`POST
  /financing/reconcile/:financingIntentId` are manual/job-friendly
  triggers only; nothing periodically calls them yet. Because every
  sandbox adapter derives its "remote" status from the same `mode` input
  that sets the local status in one atomic step, a genuine local/remote
  disagreement can't currently arise through the public API alone — the
  `RESOLVED_SUCCEEDED`/`RESOLVED_FAILED` branches are proven by advancing
  a gateway's own in-memory status map directly in a test (see the
  reconciliation e2e scenario above), not by a real missed-webhook race.
- **No admin/support role model** — the internal payment/financing ops
  view (`GET /checkout/:id/ops`) and the refund endpoints are reachable
  only by session auth plus ownership, exactly like every other consumer
  endpoint; there is no separate ops/support account type, and no audit
  trail of *who* looked at a checkout's payment history beyond the
  request logs themselves.
- **The payment-method-switch guard only unblocks after a terminal
  failure, never mid-flight** (Handoff 07) — once a checkout commits to
  `ONLINE_PAYMENT` or `INSTALLMENTS`, switching to the other method is
  rejected while that method's own attempt is still pending/in-progress;
  it becomes possible again only once that attempt reaches
  `FAILED`/`CANCELLED` (payment) or `DECLINED`/`CANCELLED`/`EXPIRED`
  (financing) — by design, but worth knowing if a future handoff wants a
  "cancel and switch immediately" affordance instead.
- **No pharmacy, subscription, or prescription commerce** — `Product`/
  `SellerOffer` model general retail goods only; there is no prescription
  verification, recurring-order/subscription billing, or controlled-item
  handling.
- **No review/rating surface for products or sellers** — `SellerOffer`/
  `Product` carry no rating fields, and the product card/detail UI
  deliberately never fabricates one (spec: "no fake ratings").
- **No advanced recommendations** — Shop Home's product list is every
  active product filtered by the request's `petId`/`category`/`search`,
  using the exact same deterministic `ProductCompatibilityService` every
  other Shop screen uses; there is no personalization, ranking model, or
  "customers also bought" feature.
- **A pre-existing race in `HomeView`'s active-pet refetch was found and
  fixed while validating this handoff's "switch pet" flow, not introduced
  by it**: `useActivePet.switchActivePet` optimistically flips
  `activePetId` in the client store *before* the server-side
  `PUT .../active-pet` call resolves; `HomeView`'s effect (which depends on
  `activePetId`) could fire its `GET /home` refetch in that same instant
  and read back the *previous* active pet, with nothing ever re-triggering
  a correcting refetch once the PUT actually completed. Fixed by also
  depending on `useActivePet().isSwitching` — a second refetch now fires
  the moment the switch's own request settles. `ProductDetailView`/other
  screens that read `activePet` directly from the store (rather than via a
  server round-trip keyed only on the pre-switch instant) were never
  affected; this was specifically a Home-heading staleness bug.
- **`InventoryReservation` cleanup is request-time only, like `PetAccessGrant`
  expiry** — an expired-but-still-`ACTIVE` reservation row is corrected the
  next time it's read/used (`pay()` checks `expiresAt` itself), never by a
  background sweep; there is no cron/worker that proactively flips expired
  reservations to `EXPIRED` or releases their inventory ahead of time.
- **Checkout price revalidation surfaces drift, but doesn't re-price
  automatically** — a `PRICE_CHANGED` `CheckoutValidationIssueDto` is
  returned for the caller to see and decide on; there is no
  "auto-accept the new price and continue" endpoint, and no requirement
  that the frontend block progress on it (only `SAFETY_CONFLICT` hard-blocks).
- **`CheckoutStatus.PARTIALLY_CONFIRMED` is defined but never reached** —
  the architecture is designed to support one seller's `Order` confirming
  while another in the same multi-seller checkout fails (each `Order`
  creation is independent, per-seller, inside the loop), but this phase's
  `DevPaymentGateway` only ever fails or succeeds the *entire* payment
  attempt, so a genuinely partial outcome never currently occurs; a future
  handoff introducing per-seller payment splits or partial captures should
  wire this status rather than add a new one.
- **No real merchant credentials for AloPeyk or SnappBox** (Handoff 08) —
  both adapters are documented sandbox boundaries sharing `DevShippingAdapter`'s
  own simulation engine (see the Handoff 08 section above for exactly
  what's real vs. UNKNOWN per provider); no live quote/create-shipment/
  webhook round-trip or real webhook signature scheme exists for either.
- **No Seller OS / seller-ops auth model** (Handoff 08) — `mark ready for
  pickup`/`request courier`/`cancel`/`reconcile` are reachable only by the
  order's own owner (the customer), the same "no admin/support role model
  yet" limitation Handoff 07's ops view has; a real seller would use these
  same `ShippingOrchestrator` methods once Handoff 09 adds
  `SellerUser`/`SellerAuthGuard`.
- **No shipping-fee ledger posting** — `LedgerService` still only records
  the full payment/refund amount (Handoff 07); the shipping-fee component
  of `deliveryAmount` is not split into its own ledger account this phase
  (no `SHIPPING_FEE`/carrier-payable account exists), since no real courier
  invoicing relationship exists to model.
- **No package dimensions, only weight** — `ShippingPackage.weightGrams` is
  derived from `ProductVariant.weightValue`/`weightUnit` when present;
  `widthCm`/`heightCm`/`lengthCm` are always `undefined` since this catalog
  has no dimension fields, never fabricated. A future handoff adding
  dimension fields to `ProductVariant` would need no `ShippingPackage`
  shape change, only a real value to populate it with.
- **`ShippingQuote` price/ETA are identical across all three providers** —
  since `AloPeykAdapter`/`SnappBoxAdapter` currently delegate to the same
  simulation engine as `DevShippingAdapter`, a checkout sees the same
  STANDARD/EXPRESS price and ETA no matter which provider a customer
  theoretically picks; the consumer UI already deduplicates by service
  level rather than showing three identical-looking rows, but this masks
  the fact that no real price differentiation between providers exists yet.
- **No shipment cancellation once picked up** — `cancelFulfillment()` only
  calls the provider's `cancelShipment()` when the Shipment is still
  `CREATED`/`REQUESTED`/`ASSIGNED`; a shipment past `PICKED_UP` cannot be
  cancelled through this endpoint (matches every simulated adapter's own
  `cancelShipment` eligibility rule) — there is no "delivery in progress,
  redirect/return to sender" workflow.
- **No automatic Fulfillment retry after a genuine courier failure** — a
  `FAILED` Shipment/Fulfillment is a terminal state; recovering from it
  today means a person manually deciding what to do (e.g. a refund via the
  existing Handoff 07 refund flow), not an automated re-attempt or a
  second Fulfillment `sequenceNumber`. The schema supports a future
  `sequenceNumber: 2` retry attempt; no service method creates one yet.
- **Package/parcel weight and shipping quotes are computed at request time
  only** — there is no persisted `ShippingPackage` record; if `ProductVariant`
  weight data changes after a quote was issued, the already-issued quote's
  price is unaffected (it was already locked in), but a *new* quote request
  would reflect the change — consistent with every other commercial
  snapshot in this codebase, just worth calling out explicitly here.

## Next recommended coding handoff

**A minimal Seller OS** (Handoff 09), now with a genuinely complete
foundation to sit on top of: Handoff 07 gave the platform a real (if
sandboxed) payment/BNPL/refund pipeline with a double-entry ledger, and
Handoff 08 gave it a real physical-fulfillment lifecycle
(`Fulfillment`/`Shipment`) with seller-ops actions
(`ShippingOrchestrator.markReadyForPickup()`/`requestCourier()`/
`cancelFulfillment()`) already implemented and ready to be re-exposed
under real seller authentication rather than "owner of the order." Every
`SellerOrganization`/`SellerOffer`/`InventoryItem` still exists only via
`prisma/seed.ts` today — there is no seller-facing surface at all. A
minimal next step, reusing the exact same session auth and authorization
pattern `ProviderAuthGuard`/`ProviderContextService` already established
(a `SellerUser`/`SellerOrganization` membership model, a `SellerAuthGuard`
that is a completely separate axis from pet-data authorization, exactly
as `ProviderAuthGuard` is): (1) a seller order queue (`GET
/seller/orders`, `GET /seller/orders/:id`) scoped to that seller's own
`Order` rows only (never another seller's — same "403, never a silent
404" IDOR posture as Provider OS); (2) inventory management (`PATCH
/seller/offers/:id/inventory` to adjust `onHand`, reusing the exact same
`InventoryReservationService` invariants — never a second stock-tracking
path); (3) re-pointing the *existing* `ShippingOrchestrator` seller-ops
methods (`markReadyForPickup`/`requestCourier`/`cancelFulfillment`/
`reconcileShipment`) at `SellerAuthGuard` instead of "checkout owner" —
the service layer already exists, this handoff's job is building the
seller-facing controller/UI in front of it, not redesigning the
orchestration; (4) basic order-status progression (`PENDING → CONFIRMED →
PREPARING → READY_FOR_FULFILLMENT → FULFILLED`, finally reaching the
`OrderStatus` values Handoff 06 defined but never made reachable),
mirrored from `Fulfillment.status` reaching the equivalent milestone,
with the same "single-step transition, reject anything else" discipline
`ProviderBookingsService` used; and (5), now genuinely in scope, a first
real posting to `SELLER_PAYABLE` (e.g. crediting it — and correspondingly
debiting `CUSTOMER_PAYMENT_CLEARING` — for the seller's share once an
Order is `FULFILLED`), still through `LedgerService.recordBalanced()`,
never a new write path. Full settlement/payout execution, refund-adjusted
seller payables, and seller-side pricing/catalog editing are substantial
enough to stay a dedicated follow-up past this one, exactly as Provider
OS's own verification workflow was deferred past Handoff 05.

Alternatively, if the business prioritizes closing the remaining external-
provider gaps instead of building the Seller OS: once real merchant
credentials/official docs for SnappPay, DigiPay, a standard payment
gateway, AloPeyk, or SnappBox become available, swap the corresponding
adapter's sandbox/simulation bodies for real HTTP calls and a real webhook
signature scheme, without touching `PaymentGateway`/`FinancingProvider`/
`ShippingGateway`'s shape — every adapter already implements the full
interface its capability map declares, so a real integration is a
same-class rewrite, not a new architecture. `validatePaymentConfig()`/
`validateShippingConfig()` already refuse to boot with `PAYMENT_SANDBOX_MODE=
production`/`SHIPPING_MODE=production` unless the enabled provider's
credential env vars are set, specifically to make this transition safe.
Whichever is chosen, keep `Product`/`SellerOffer`/`InventoryItem` strictly
separate (never collapse catalog identity, price, and stock back into one
model), keep "1 Checkout → N Orders" and "1 Order → N Fulfillments → N
Shipments" (schema-ready, MVP uses N=1) as the non-negotiable invariants,
keep IRR as the only stored currency unit, and keep every financial write
going through `LedgerService.recordBalanced()` and every Fulfillment
status change going through `FulfillmentTransitionService.transition()`
— never a second write path for either, no matter how small the change
looks.

**A minimal Seller OS**, directly mirroring how Handoff 05's minimal
Provider OS followed the vet booking engine (Handoff 03), and now a more
natural next step than before: Handoff 07 gave the platform a double-entry
ledger with `SELLER_PAYABLE`/`PLATFORM_REVENUE` accounts already seeded
but never posted to, and a real (if sandboxed) payment/BNPL/refund
pipeline for a Seller OS to sit on top of, so this handoff can focus on
the seller-facing surface itself rather than blocking on payments
infrastructure. Every `SellerOrganization`/`SellerOffer`/`InventoryItem`
still exists only via `prisma/seed.ts` today — there is no seller-facing
surface at all. A minimal next step, reusing the exact same session auth
and authorization pattern `ProviderAuthGuard`/`ProviderContextService`
already established (a `SellerUser`/`SellerOrganization` membership
model, a `SellerAuthGuard` that is a completely separate axis from
pet-data authorization, exactly as `ProviderAuthGuard` is): (1) a seller
order queue (`GET /seller/orders`, `GET /seller/orders/:id`) scoped to
that seller's own `Order` rows only (never another seller's — same "403,
never a silent 404" IDOR posture as Provider OS); (2) inventory
management (`PATCH /seller/offers/:id/inventory` to adjust `onHand`,
reusing the exact same `InventoryReservationService` invariants — never a
second stock-tracking path); (3) basic order-status progression
(`PENDING → CONFIRMED → PREPARING → READY_FOR_FULFILLMENT → FULFILLED`,
finally reaching the `OrderStatus` values Handoff 06 defined but never
made reachable) with the same "single-step transition, reject anything
else" discipline `ProviderBookingsService` used; and (4), now genuinely
in scope given Handoff 07's ledger foundation, a first real posting to
`SELLER_PAYABLE` (e.g. crediting it — and correspondingly debiting
`CUSTOMER_PAYMENT_CLEARING` — for the seller's share once an Order is
`FULFILLED`), still through `LedgerService.recordBalanced()`, never a new
write path. Full settlement/payout execution, refund-adjusted seller
payables, and seller-side pricing/catalog editing are substantial enough
to stay a dedicated follow-up past this one, exactly as Provider OS's own
verification workflow was deferred past Handoff 05.

Alternatively, if the business prioritizes closing the remaining
payment-provider gap instead of building the Seller OS: once real
merchant credentials/official docs for SnappPay, DigiPay, or a standard
gateway become available, swap the corresponding adapter's sandbox
`mode`-driven bodies for real HTTP calls and a real webhook signature
scheme, without touching `PaymentGateway`/`FinancingProvider`'s shape —
every adapter already implements the full interface `PROVIDER_CAPABILITIES`
declares, so a real integration is a same-class rewrite, not a new
architecture. `validatePaymentConfig()` already refuses to boot with
`PAYMENT_SANDBOX_MODE=production` unless the enabled provider's credential
env vars are set, specifically to make this transition safe. Delivery
integration (`AloPeyk`/`SnappBox` behind the existing `DeliveryMethod`
placeholder) remains a separate, still-untouched gap. Whichever is
chosen, keep `Product`/`SellerOffer`/`InventoryItem` strictly separate
(never collapse catalog identity, price, and stock back into one model),
keep "1 Checkout → N Orders" as the non-negotiable invariant, keep IRR as
the only stored currency unit, and keep every financial write going
through `LedgerService.recordBalanced()` — never a second ledger-write
path, no matter how small the change looks.
