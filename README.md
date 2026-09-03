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

## Seller OS + Marketplace Channel Integrations (Handoff 09)

Schema: `prisma/migrations/20260902150000_seller_os_marketplace_channels`
(purely additive, generated via `prisma migrate diff`, then hand-appended
with `CHECK` constraints Prisma's DSL can't express: non-negative
`InventoryMovement.quantityBefore`/`quantityAfter`, non-negative
`MarketplaceOrder.totalAmount`, positive `MarketplaceOrderItem.quantity`
plus non-negative unit/total price amounts, positive
`MarketplaceListing.publishedPriceIrr` plus non-negative
`publishedInventory`, and positive `MarketplaceSyncAttempt.attemptNumber`),
plus a small follow-up migration
(`20260902160000_marketplace_order_status_unknown`) adding
`MarketplaceOrderStatus.UNKNOWN` to the enum. New enums:
`SellerMembershipRole` (`OWNER`/`ADMIN`/`OPERATIONS`/`CATALOG_MANAGER`/
`ORDER_MANAGER`/`FINANCE`/`SUPPORT`/`VIEWER`), `SellerMembershipStatus`,
`InventoryMovementType`/`InventoryMovementReason`, `MarketplaceProvider`
(`DEV`/`TOROB`/`DIGIKALA`), `MarketplaceChannelAccountStatus`,
`MarketplaceListingStatus`/`MarketplaceListingSyncStatus`,
`MarketplaceOrderStatus`, `MarketplaceSyncAttemptKind`/`Status`,
`FulfillmentDeliveryResponsibility`. New models: `SellerMembership`,
`SellerContextPreference`, `InventoryMovement`,
`MarketplaceChannelAccount`, `MarketplaceListing`, `MarketplaceOrder`,
`MarketplaceOrderItem`, `MarketplaceSyncAttempt`. `SellerOffer.sellerSku`
added; `Order.checkoutId`/`Order.userId` made nullable; `Order.
marketplaceOrder` relation added; `Fulfillment.deliveryResponsibility`
added.

### Seller authorization — a real membership model, deliberately *not* an implicit-context copy of Provider OS

`SellerMembership` (userId + sellerOrganizationId + role + status,
`@@unique([userId, sellerOrganizationId])`) replaces Handoff 08's
temporary "owner of the order" auth entirely. `SellerAuthGuard` mirrors
`ProviderAuthGuard`'s shape closely — but with one deliberate divergence,
documented in the guard's own code comment: Provider OS resolves an
implicit "active organization" from a `ProviderContextPreference` because
most of its routes carry no organization id in the URL; every Seller OS
route instead carries its own `:sellerId` path param, and the guard
*always* resolves membership from that param — never from an implicit
context — specifically so there is no ambiguity a client could exploit by
omitting or mismatching context state. `SellerContextPreference` still
exists (mirroring `ProviderContextPreference`) purely to drive the
frontend's "last active seller" convenience on login; it is never
consulted for authorization. `RequireSellerRole(...)` + the guard's own
`roleSatisfies()` helper implement a small role hierarchy:
`OWNER`/`ADMIN` satisfy any requirement; `OPERATIONS`/`CATALOG_MANAGER`/
`ORDER_MANAGER`/`FINANCE`/`SUPPORT` must be explicitly listed; `VIEWER`
(and any handler with no `@RequireSellerRole` at all) gets read-only
access to any `ACTIVE` member. A `SUSPENDED`/`RESTRICTED`/`CLOSED` seller
organization still allows reads (`SellerAccessService.assertOperational()`
is called by mutating actions only, never by a read) but rejects every
mutating action with `SELLER_ACCESS_DENIED`/`reason: SELLER_SUSPENDED`.
`SellerTeamService.
assertNotLastOwner()` blocks both demoting and removing the sole
remaining `ACTIVE` `OWNER`, so a seller organization can never be left
with no one who can manage it.

### Inventory — one new mutation surface, the reservation flow untouched

`InventoryMovementService.applyOnHandDelta()` is the single new place
`InventoryItem.onHand` is ever mutated outside Handoff 06's own Checkout-
reservation flow (which still exclusively owns `reserved`, unchanged).
It uses the identical `SELECT ... FOR UPDATE` raw-SQL row-lock pattern
`InventoryReservationService` already established, checking both
`onHand >= 0` and `available (onHand - reserved) >= 0` before applying a
delta or an absolute set — the same oversell-protection guarantee, now
also covering seller manual adjustments and marketplace order ingestion/
cancellation. Every call writes an append-only `InventoryMovement` audit
row (`type`: `MANUAL_ADJUSTMENT`/`MARKETPLACE_ORDER`/
`MARKETPLACE_CANCELLATION`/`RECONCILIATION`; `quantityBefore`/
`quantityAfter` always consistent by a DB `CHECK`). PET LIFE OS's own
inventory table remains the single source of truth for stock — a
marketplace never writes it directly, only through this service.

### `MarketplaceChannelAdapter` — the same adapter-interface discipline as `PaymentGateway`/`ShippingGateway`

One interface (`connect`/`publishListing`/`updateListingInventory`/
`updateListingPrice`/`pauseListing`/`pullOrders`/`cancelOrder`, plus
`readonly provider`/`readonly capabilities`) every provider implements;
`MARKETPLACE_PROVIDER_CAPABILITIES` (`supportsListingPublish`/
`supportsInventoryPush`/`supportsPricePush`/`supportsOrderPull`/
`supportsWebhooks`/`supportsOrderCancellation`/`supportsListingPause`/
`supportsReconciliation`/`supportsVariantMapping`) is one static map
consulted everywhere instead of branching on provider identity.
`MarketplaceChannelRegistryService` resolves `MarketplaceProvider →
adapter instance` and gates on the matching `*_ENABLED` env flag, exactly
like `ShippingProviderRegistry`. All three adapters share one generic,
clearly-labeled deterministic simulation engine
(`marketplace-simulation.util.ts` — no randomness in price/inventory
echoes, only opaque ids use `randomUUID()`) and one order-status
normalizer (`marketplace-order-status-normalizer.ts`, unrecognized raw
status → `UNKNOWN`, never interpreted as success).

- **`DevMarketplaceAdapter`** is fully functional — connect, publish,
  inventory/price sync, pause, and a dev-only order-injection/
  cancellation path used by the E2E suite and `MarketplaceDevController`
  to exercise the *real* ingestion/cancellation pipeline, never a
  shortcut around it.
- **`TorobAdapter`/`DigikalaAdapter`** each carry an extensive
  class-level "PROVIDER DOCUMENTATION SAFETY" doc comment — official docs
  source, auth mechanism, sandbox availability, credentials, webhook/
  polling model, and idempotency guarantees are all marked explicitly
  UNKNOWN, since no genuine official documentation or credentials for
  either provider were available to this project. Every method delegates
  to the same simulation engine as `DevMarketplaceAdapter` when not
  production-configured. `isProductionConfigured()` checks
  `MARKETPLACE_SANDBOX_MODE === "production"` **and** real credentials
  configured (`TOROB_API_KEY`/`DIGIKALA_API_KEY`); when that's false
  (always, today), every method uses the simulation. If
  `MARKETPLACE_SANDBOX_MODE=production` is set without real credentials,
  the adapter throws rather than silently faking a production response —
  never scraping, never inventing an endpoint shape, never presenting a
  simulated value as a real Torob/Digikala API value.
- **DEV as a channel is hard-excluded from ever looking connectable in
  the seller-facing UI or the connect-provider list** — it exists purely
  for internal testing/demonstration, never presented to a real seller as
  a marketplace they can publish to.
- **Order/cancellation ingestion has no real inbound webhook endpoint this
  phase** — since neither Torob nor Digikala has a confirmed webhook
  shape/signature scheme, ingestion is exercised via
  `POST /seller-organizations/:sellerId/channels/:channelAccountId/dev/
  simulate/order` (and `/cancellation`, `/mismatch`,
  `/publish-rejection`), all hard-disabled outside development/test via
  `NODE_ENV` (`MarketplaceDevController.assertDevSimulationAllowed()`,
  covered by a dedicated unit test since e2e tests can't reliably flip
  process-wide Nest config mid-suite) — but every one of those routes
  drives the exact same `MarketplaceOrderIngestionService`/
  `MarketplaceSyncOrchestratorService` pipeline a real webhook would, not
  a shortcut around it.

### Marketplace order ingestion — real idempotency, and the transaction-abort bug it surfaced

`MarketplaceOrderIngestionService.ingestOrder()` is keyed for real
duplicate-delivery idempotency by `@@unique([marketplaceChannelAccountId,
externalOrderId])` on `MarketplaceOrder` — the provider+account+external-
id triple is the only thing that decides "have we already seen this
order," never a client-supplied idempotency header. Building this
surfaced a genuine, previously-latent correctness bug worth documenting
explicitly: catching a Prisma `P2002` unique-violation *inside* a
`$transaction()` callback and then continuing to query on that same
transaction client fails outright with Postgres `25P02` ("current
transaction is aborted") — Postgres aborts the whole transaction after
any statement error, and Prisma does not auto-savepoint around a caught
error. The fix, now the pattern for this whole flow: the idempotency-
guarded row is claimed via a plain, non-transactional
`prisma.marketplaceOrder.create()` first (a P2002 here is caught cleanly,
no ambient transaction to poison), then all the actual work — resolving
`MarketplaceListing → SellerOffer`, decrementing inventory via
`InventoryMovementService`, creating the internal `Order`/`OrderItem`
rows, linking `mappedOrderId` — happens in a *separate* `$transaction()`,
with a catch block that marks the claimed row `FAILED` (never leaves it
stuck `PENDING`) before rethrowing if that second phase fails for any
reason (e.g. a concurrent PET LIFE OS checkout already reserved the last
unit — see the oversell e2e test). Two concurrent marketplace orders for
the last unit of stock therefore both get a permanent, honest
`MarketplaceOrder` record — one `mappedOrderId`-linked winner, one
`FAILED` loser — rather than the loser silently vanishing.
`OrdersService.createForCheckout()` has this exact same latent
P2002-inside-`$transaction()` shape, but is never actually triggered in
practice (`CheckoutService`'s own `checkout.status === CONFIRMED` short-
circuit prevents ever reaching the retry branch) — noted here, not fixed,
since it's out of this handoff's scope and genuinely unreachable today.

### `MarketplaceOrder → Order` mapping, deliberately *without* an auto-created `Fulfillment`

A marketplace order gets a real internal `Order` + `OrderItem` rows (for
seller-side visibility/reporting in the unified Seller Orders view,
`checkoutId`/`userId` both `null` since there is no PET LIFE OS checkout
or registered buyer) — but no `Fulfillment`/`Shipment` is auto-created
this phase. PET LIFE OS must never assume it owns marketplace last-mile
delivery or silently request a courier on a seller's behalf when the
marketplace itself is responsible for shipping; `Fulfillment.
deliveryResponsibility` (`PETLIFE_OS`/`MARKETPLACE`) exists in the schema
specifically so a future handoff can wire seller-choice or
provider-declared delivery responsibility without another migration.
Marketplace cancellation (`MarketplaceOrderIngestionService.
cancelOrder()`) restores the exact inventory quantity the original order
decremented, via the same `InventoryMovementService`, and is itself
idempotent — a duplicate cancellation of an already-`CANCELED`
`MarketplaceOrder` is a safe no-op, never a double-restore.

### Listings, sync, and reconciliation — sync status and business status are separate axes, never fabricated success

`MarketplaceListing.status` (`DRAFT`/`ACTIVE`/`PAUSED`/`ENDED`) is the
seller's intended business state; `syncStatus`
(`PENDING`/`SYNCING`/`SYNCED`/`FAILED`/`DEGRADED`) is whether the last
attempt to reflect that state on the provider actually succeeded — the
two are never collapsed into one field, so a paused-but-still-showing
listing or a published-but-sync-failed listing is always visible as such,
never hidden behind a single green checkmark.
`MarketplaceSyncOrchestratorService` records a `MarketplaceSyncAttempt`
row (kind: `PUBLISH`/`INVENTORY_SYNC`/`PRICE_SYNC`/`RECONCILE`; status:
`SUCCESS`/`FAILED`) for every attempt, success or failure, and a failed
attempt sets `syncStatus: FAILED` with `lastErrorCode`/`lastErrorMessage`
populated — never silently retried into looking successful.
Reconciliation compares the provider's last-observed inventory against
PET LIFE OS's own canonical `available` quantity; a mismatch sets
`syncStatus: DEGRADED` and is logged, but **never** overwrites canonical
PET LIFE OS stock with what a marketplace reports — inventory truth flows
one direction only, PET LIFE OS → marketplace, never back.

### Re-pointing Handoff 08's temporary "owner of the order" seller-ops auth to real `SellerMembership`

`ShippingOrchestrator.loadOwnedFulfillment` (buyer-only) is now
`loadSellerFulfillment` — it checks for an `ACTIVE` `SellerMembership` on
`fulfillment.sellerOrgId` directly via `PrismaService` (no `SellerOsModule`
import, avoiding a module cycle, exactly like `RefundsService` does for
`Order`), plus new `loadSellerOrder`/`getFulfillmentForOrderAsSeller`/
`getShipmentForOrderAsSeller` resolvers. `OrderLogisticsController`'s four
mutating routes (`mark ready for pickup`, `request courier`, `cancel`,
`reconcile`) now require seller-organization membership at the *same*
URLs — the buyer-facing tracking `GET` routes are unchanged and remain
buyer-owned. No logistics logic was duplicated or moved; every method
`ShippingOrchestrator` already implemented in Handoff 08 is reused as-is,
per the spec's explicit instruction.

### Frontend — a completely separate Seller Shell, mirroring Provider OS's own isolation

`apps/web/features/seller/` (Dashboard, Orders, Order Detail, Offers,
Inventory, Channels, Team, Settings) is its own route group
(`app/[locale]/(seller)/seller/...`), own Zustand store
(`useSellerStore`), own session-bootstrap hook — it never mixes with
consumer or Provider OS navigation, exactly like Provider OS never mixed
with consumer. The Channels view never hides a listing sync error behind
a generic "connected" badge, and explicitly labels an inventory mismatch
rather than silently trusting the provider's echoed number. The Team
view's last-owner-safeguard rejection is surfaced by reloading true
server state (`await load()`) rather than trusting an optimistic UI
update, so a rejected role change can never *look* like it succeeded
client-side. Full Persian (RTL)/English (LTR) localization via the
existing `next-intl` "seller" namespace.

### API endpoints (Handoff 09 additions)

See the full endpoint list below (`GET /seller-organizations` through the
per-channel `POST .../dev/simulate/*` routes). There is no real inbound
marketplace webhook endpoint this phase — Torob/Digikala are sandbox-only
(no official docs/credentials, see below), so order/cancellation
ingestion is exercised through the dev-simulate routes, which drive the
exact same `MarketplaceOrderIngestionService` pipeline a real webhook
would.

### Error codes (Handoff 09 additions)

```
SELLER_ACCESS_DENIED                 403  no ACTIVE SellerMembership on the target :sellerId, insufficient role, or a suspended org rejecting a mutation — `details.reason` distinguishes NOT_A_SELLER/AMBIGUOUS_CONTEXT/CROSS_ORGANIZATION/INSUFFICIENT_ROLE/SELLER_SUSPENDED/MISSING_SELLER_ID; never a silent 404
SELLER_ORGANIZATION_NOT_FOUND        404  no such seller organization
SELLER_MEMBERSHIP_NOT_FOUND          404  no such membership on this seller organization
SELLER_LAST_OWNER                    409  would demote/remove the sole remaining ACTIVE OWNER
INVENTORY_MOVEMENT_INVALID           409  the requested adjustment would make onHand or available negative
MARKETPLACE_PROVIDER_UNAVAILABLE     502  resolved provider has no registered adapter
MARKETPLACE_PROVIDER_DISABLED        400  provider exists but its *_ENABLED flag is off
MARKETPLACE_CHANNEL_ACCOUNT_NOT_FOUND 404 no such channel account, or it belongs to a different seller
MARKETPLACE_LISTING_NOT_FOUND        404  no such listing, or it belongs to a different seller
MARKETPLACE_LISTING_MAPPING_REQUIRED 400  this offer must be mapped to a marketplace listing before it can be synced
MARKETPLACE_CAPABILITY_UNSUPPORTED   400  the resolved provider's capability map doesn't support the requested operation
MARKETPLACE_SYNC_FAILED              502  the provider adapter's sync call itself failed
MARKETPLACE_ORDER_NOT_FOUND          404  no such marketplace order
MARKETPLACE_ORDER_INGESTION_FAILED   409  order ingestion failed after claiming the idempotency row (row marked FAILED)
MARKETPLACE_WEBHOOK_INVALID          400  reserved for a future real webhook signature check — unused while ingestion is dev-simulate-only
```

## Messaging, Notifications & Preferences (Handoff 10)

Schema: `prisma/migrations/20260902170000_notifications_messaging_preferences`
(purely additive; hand-appended `CHECK` constraints Prisma's DSL can't
express: non-negative `NotificationDelivery.attemptCount`, and a regex
`CHECK` on `NotificationQuietHours.startTime`/`endTime` enforcing a strict
24h `HH:mm` string at the database layer). New enums:
`NotificationChannel` (`IN_APP`/`SMS`/`EMAIL`/`PUSH` — the latter two
defined-but-unreachable, see below), `NotificationCategory` (13 values
including the deliberately-separate `MARKETING`), `NotificationPriority`,
`NotificationDeliveryStatus`, `NotificationFailureKind`,
`MessagingProvider` (`DEV`/`FARAZ`). New models: `Notification`,
`NotificationDelivery`, `NotificationPreference`,
`NotificationQuietHours`. `Notification.locale` reuses the existing
`Locale` enum rather than a raw string.

### Pipeline: `Domain Event → Notification Orchestrator → Preferences/Quiet Hours → Template → Channel Delivery`

`NotificationOrchestratorService.notify()` is the single write path every
caller (a domain-event listener, or the dev-simulate controller) goes
through — no caller ever touches `notification`/`notificationDelivery`
tables directly. Per call: resolve the recipient's locale, render the
template (see below), claim the `Notification` row (idempotent — see
below), create its `IN_APP` delivery as `DELIVERED` immediately (an
in-app "delivery" has no external transport; the row's existence *is* the
delivery), then — only if the resolved template has an `smsBody` variant
for this locale — evaluate SMS eligibility: a missing/invalid phone
number or a disabled category/channel preference produces a `SKIPPED`
delivery row with the reason recorded in `metadata.reason`, never a
silent no-op; quiet hours (see below) either defers it (`QUEUED` +
`scheduledAt`) or it's attempted immediately via
`NotificationDeliveryService.attempt()`.

### Idempotency — the same `DomainEvent.id` threading through `EventEmitter2`

`DomainEventsService.publish()` gained one additive, backward-compatible
change this handoff: `this.emitter.emit(type, payload, event.id)` now
passes the just-persisted `DomainEvent.id` as a second positional
argument. Every pre-existing `@OnEvent` listener (e.g.
`PaymentEventsListener`) declares only one parameter and simply never
sees it — EventEmitter2 forwards extra `emit()` arguments positionally,
and JavaScript ignores extra call arguments a function doesn't declare.
`NotificationEventsListener`'s own handlers are the only ones that
declare the second `domainEventId` parameter, and pass it straight
through to `notify()`. `Notification`'s own
`@@unique([domainEventId, type, userId])` is the actual idempotency
anchor (spec's suggested "eventId + notificationType + recipient", with
`channel` scoping living one level down on `NotificationDelivery`'s own
`@@unique([notificationId, channel])`): the row is claimed via a plain,
non-transactional `create()` first — the exact two-phase "claim outside
any transaction, catching P2002 cleanly" pattern
`MarketplaceOrderIngestionService` established in Handoff 09 — and a
duplicate claim returns the existing row with `created: false`, skipping
delivery fan-out entirely (never a second SMS). Postgres treats every
`NULL` `domainEventId` as distinct, so dev/manually-created notifications
(no originating event) never collide with each other.

### Templates — code-defined, not the `NotificationTemplate` table

Every other piece of transactional copy in this codebase already lives
in source (next-intl's `fa.json`/`en.json`), never a database; SMS has no
frontend to render it, so `notification-templates.ts` is the backend's
own equivalent — a plain `Record<type, Record<Locale, {title, body,
smsBody?}>>` with `{{param}}` interpolation. Resolution is explicit
(spec: "do not silently return broken template content"): exact
`locale` → `"en"` → throw a real (500-class) error, since a missing
template is a programmer mistake, not a user-facing 4xx. The
`NotificationTemplate` Prisma model exists in the schema for a future
content-managed system — swapping the resolver's lookup order for a
DB-backed one needs no schema change — but nothing in H10 persists to it.
**A template with no `smsBody` variant is IN_APP-only by construction**
— this is the actual privacy mechanism (see Health privacy below), not a
runtime content filter.

### Preferences — a resolved-default grid, security non-suppressible, marketing opt-in-by-default

`NotificationPreference` is a sparse override table: no row for a given
(user, category, channel) means "enabled", so a brand-new user needs no
seed rows for correct default behavior — **except `MARKETING`**, whose
default comes from `CountryConfig.marketingDefaultEnabled` (`false` for
Iran) rather than the general default, so marketing consent is never
silently inferred from the absence of an explicit transactional
preference row. `SECURITY` is in `NON_SUPPRESSIBLE_CATEGORIES` and never
even consults this table — `NotificationOrchestratorService` doesn't
special-case it either; the preference *service* itself
(`NotificationPreferenceService.resolve()`) returns `true`
unconditionally for it before ever querying. Quiet hours are
deliberately their own singleton-per-user table
(`NotificationQuietHours`), not fields smeared across every
category/channel preference row — a normalization decision, not a
literal reading of the spec's flat suggested-fields list.

### Quiet hours — pure clock/timezone semantics, no Persian-calendar coupling

`notification-quiet-hours.util.ts` is built entirely on ICU
(`Intl.DateTimeFormat`), matching how Jalali/Gregorian dual display is
done everywhere else in this codebase — no new date library.
`isWithinQuietHours()` handles the overnight-wrap case (22:00→08:00)
via local-clock-minutes comparison. `nextQuietHoursEndUtc()` computes the
next UTC instant at which the local clock reads the configured end time
by adding the delta between current and target local minutes to the
current UTC instant — correct as long as no DST transition falls in
between; Iran has had no DST since 2022, so this is exact for
`CountryConfig`'s only real entry today, but a future country with an
active DST rule would need a real timezone-offset lookup here instead
(documented as a known limitation, not silently assumed to still work).
`NotificationPriority.URGENT` is the one explicit "bypass quiet hours"
signal a caller must deliberately choose — never inferred from category.

### `MessagingGateway` — provider-neutral, mirroring `PaymentGateway`/`ShippingGateway`/`MarketplaceChannelAdapter` exactly

One interface (`sendSms`/`getMessageStatus`/`verifyWebhook`, plus
`readonly provider`/`readonly capabilities`) every provider implements;
`MESSAGING_PROVIDER_CAPABILITIES` is the one static map consulted
everywhere instead of branching on provider identity.
`MessagingProviderRegistry` resolves `MessagingProvider → adapter
instance` and gates on the matching `*_ENABLED` env flag, exactly like
every prior provider registry in this codebase. Domain-event listeners
and the notification services never reference a Faraz-specific concept
(endpoint shape, auth header, status vocabulary) outside
`faraz-sms.adapter.ts` itself.

- **`DevMessagingAdapter`** is fully functional — deterministic
  success/transient-failure/permanent-failure simulation
  (`messaging-simulation.util.ts`, no randomness in outcome, only opaque
  ids use `randomUUID()`), a simulated `DELIVERED` follow-up state for
  test determinism, and a dev-only webhook verifier.
- **`FarazSmsAdapter`** carries the same "PROVIDER DOCUMENTATION SAFETY"
  doc-comment discipline as every H07-H09 adapter — no official Faraz SMS
  merchant/API documentation or credentials were available to this
  project, so it does not call any real Faraz endpoint, invent a
  request/response shape, or guess an auth header. `sendSms` delegates to
  the same simulation engine `DevMessagingAdapter` uses when not
  production-configured; `isProductionConfigured()` requires both
  `MESSAGING_SANDBOX_MODE=production` and real `FARAZ_SMS_BASE_URL`/
  `FARAZ_SMS_API_KEY` — without both, every method returns an explicit
  `PROVIDER_NOT_IMPLEMENTED` failure rather than silently faking success.
  `MESSAGING_PROVIDER_CAPABILITIES.FARAZ` marks `supportsDeliveryStatus`
  and `supportsWebhook` as `false` — not because Faraz definitely lacks
  them, but because this project could not confirm either, so the honest
  default is "unconfirmed capability is treated as absent."

### Delivery state machine — `SENT` is never conflated with `DELIVERED`

`PENDING → QUEUED → SENDING → SENT/FAILED/CANCELLED/SKIPPED`, with
`DELIVERED` reachable only through an explicit, separate
delivery-confirmation step (never automatically inferred from a
successful `sendSms` call). `NotificationDeliveryService.attempt()` is
the one place a non-`IN_APP` delivery is ever attempted — it claims the
row atomically (`updateMany` on `status IN (PENDING, QUEUED)` before
calling any provider) exactly like `ShippingOrchestrator.requestCourier`/
`MarketplaceOrderIngestionService`'s own claim-before-call discipline, so
two concurrent callers for the same delivery id can never both reach the
gateway (proven by a dedicated concurrency e2e test — see below). A
dev/test-only simulated outcome (`smsSimMode`) is consumed exactly once
per attempt and always cleared from `metadata` afterward regardless of
outcome, so a bare retry (no test intervention) always attempts for real
(simulated-success in DEV) — a test wanting a second forced failure must
explicitly re-set `metadata.mode` before calling `attempt()` again.

### Retry policy — bounded, backoff, transient vs. permanent

A `TRANSIENT` failure is retried with exponential backoff (30s, 60s,
120s, capped at 15 minutes) up to `NOTIFICATION_MAX_DELIVERY_ATTEMPTS`
(default 3) total attempts, then terminates in `FAILED` — never an
infinite retry. A `PERMANENT` failure (invalid destination, provider
rejection) goes straight to `FAILED` on the very first attempt, no retry
scheduled at all. `NotificationDeliveryWorkerService` is the smallest
reliable mechanism compatible with this modular monolith (spec: "do not
introduce Kafka/RabbitMQ just for H10") — a plain `setInterval` poller,
not a new dependency (`@nestjs/schedule` isn't installed), picking up due
`PENDING`/`QUEUED` rows (a quiet-hours-deferred send whose `scheduledAt`
has arrived, or a transiently-failed send past its backoff window). It
never runs under `NODE_ENV=test`; tests call `processDueDeliveries()`
directly for determinism, the same "dev/test drives the real pipeline
synchronously" convention every DEV adapter's simulate route already
uses. **Processing guarantee**: at-least-once attempt per due row per
tick — the atomic claim in `attempt()` is what actually prevents a
duplicate send, not the poller's own scheduling.

### Privacy — SMS never carries health/medical detail by construction

Every template's `smsBody` is written independently from its `body`
(the in-app text), and a template with no `smsBody` at all is
categorically IN_APP-only — there is no runtime content filter deciding
"is this too sensitive for SMS," the decision is made once, in the
template registry, at the type level. `health.reminder`'s `smsBody`
("You have a care reminder for {{petName}}") deliberately never mentions
a diagnosis, test result, or condition, mirroring the spec's own good/bad
example pairing exactly. Destinations are masked
(`+98********12`, via `common/phone/phone-normalizer.ts`'s `maskPhone()`)
in every persisted `destinationMasked` field — the real E.164 number
lives only transiently in a delivery's `metadata.destination` for the
worker to read, never duplicated into a display-safe column, and is
never returned by any API response.

### Seller notifications — fan-out per recipient, isolation by construction

A `SELLER`/`MARKETPLACE`-category notification (e.g.
`MarketplaceListingSyncFailed`, `MarketplaceInventoryMismatchDetected`)
fans out to every `ACTIVE` `OWNER`/`ADMIN` `SellerMembership` of the
affected organization — one `Notification` row per recipient user, each
carrying that seller's `sellerOrganizationId` for filtering/correlation.
There is no separate seller-specific authorization axis for reading
these: since every `Notification` always belongs to exactly one
`userId`, the existing `GET /notifications` isolation (always scoped to
`req.user.id`) already guarantees Seller A's own OWNER never sees Seller
B's rows — proven end-to-end by triggering a real (not dev-simulated)
`MarketplaceListingSyncFailed` event via the existing publish-rejection
route and confirming only the correct seller's OWNER receives it.

### Phone normalization — one reusable path, Iran-first via `CountryConfig`

`common/phone/phone-normalizer.ts`'s `normalizeIranianPhone()` is the one
place `09.../+98.../0098...` variants are canonicalized to E.164 —
returns `null` (never a coerced-into-looking-valid number) for anything
that isn't a genuine Iranian mobile number. `auth/identifier.util.ts` is
deliberately untouched (it only needs to distinguish email from phone for
OTP delivery, never a canonical form) — this is a standalone utility for
messaging's own needs. `common/country/country-config.ts` is the first
`CountryConfig` in this codebase: a plain lookup keyed by ISO country
code (`IR` the only real entry today) bundling `smsAvailable`,
`marketingDefaultEnabled`, `defaultTimezone`, and `normalizePhone` behind
one interface — a future second country extends the map and the
dispatch, never the shape callers depend on.

### Local auth remains fully Faraz-independent

`OtpProvider`/`DevOtpProvider` (Handoff 01) are completely untouched —
`AuthService` never imports anything from the notifications module, and
`MessagingGateway` was deliberately never wired into the OTP send path
this phase (the spec permitted but did not require this). Local
development and every existing auth e2e test work exactly as before,
with zero dependency on `MESSAGING_PROVIDER`/Faraz.

### Consumer frontend — notification center + preferences, not a dropdown popover

`NotificationBell` (in the shared `AppShell` header, next to the locale/
theme controls) polls `GET /notifications/unread-count` every 30s (no
websocket infrastructure exists in this codebase yet) and links to a full
`/notifications` page rather than a popover panel — deliberately simpler
for a first pass, avoiding popover-positioning complexity.
`NotificationCenterView` shows title/body/category/timestamp per row,
a restrained `HIGH`/`URGENT` treatment (a small accent bar + bold title,
never a wall of red — only `SECURITY` gets an urgent-toned category
badge), mark-one/mark-all-read, a "load more" pager, and empty/loading/
error states. `NotificationPreferencesView` groups the category × channel
grid into named sections (Essential & Security, Health & Care, Bookings &
Services, Orders & Delivery, Household & Access, Seller & Marketplace,
Offers & Marketing); `SECURITY` renders as "Always on" text, never a
toggle; `EMAIL`/`PUSH` are never rendered as toggles at all, since
showing a control for an unimplemented channel would misrepresent it as
working. Both are reachable from the bell → notification center → a
small settings-gear icon in its own header, since this codebase has no
dedicated Account/Settings section yet (see Known limitations).
Deep links are built through one shared `NotificationDeepLinks` helper
(never a brittle inline URL string per domain) and are locale-free
relative paths — the frontend prefixes the active `/{locale}` segment
itself, so a link is correct regardless of which locale the recipient is
viewing in when they eventually open it.

### API endpoints (Handoff 10 additions)

```
GET    /notifications                            (paginated; scoped to the caller's own userId — no :userId param exists)
GET    /notifications/unread-count
PATCH  /notifications/:id/read                    (idempotent — re-reading an already-read notification is a safe no-op)
POST   /notifications/read-all
GET    /notification-preferences
PATCH  /notification-preferences

POST   /dev/notifications/simulate                          (dev/test-only; hard-disabled outside development/test via NODE_ENV)
POST   /dev/notifications/deliveries/:deliveryId/force-attempt  (dev/test-only; fast-forwards a QUEUED/PENDING delivery past its backoff/quiet-hours wait)
POST   /dev/notifications/deliveries/process-due             (dev/test-only; runs one worker tick immediately)
```

### Error codes (Handoff 10 additions)

```
NOTIFICATION_NOT_FOUND              404  no such notification, or it belongs to a different user — never a silent leak of another user's content
MESSAGING_PROVIDER_UNAVAILABLE      502  resolved provider has no registered adapter
MESSAGING_PROVIDER_DISABLED         400  provider exists but its *_ENABLED flag is off
MESSAGING_SEND_FAILED               502  the provider rejected the send outright (not a transport-level error)
MESSAGING_PROVIDER_NOT_CONFIGURED   503  MESSAGING_SANDBOX_MODE=production is set without real credentials — never a silent fallback to simulation
INVALID_PHONE_NUMBER                400  the phone number could not be normalized to a valid Iranian mobile number
MESSAGING_WEBHOOK_INVALID           400  reserved for a future real webhook signature check — unused while Faraz has no confirmed webhook scheme
```

## Admin CRM + Support + Disputes + Trust Operations (Handoff 11)

Schema: `prisma/migrations/20260902180000_admin_crm_support_disputes_trust`
(11 new models, 17 new enums, purely additive) plus
`20260902190000_support_category_and_case_number_seq` (adds `SUPPORT` to
the existing `NotificationCategory` enum and a hand-appended Postgres
sequence, `support_case_number_seq`, since Prisma's DSL has no native
`@@sequence` directive). New models: `AdminUser`, `InternalNote`,
`SupportCase`, `SupportMessage`, `Dispute`, `DisputeEvidence`,
`TrustCase`, `TrustAction`, `Appeal`, `AdminTask`, `AdminAuditLog`,
`AdminRefundApproval`. Two hand-appended `CHECK` constraints on
`AdminRefundApproval` (`admin_refund_approvals_amount_positive`,
`admin_refund_approvals_approver_not_requester`) enforce invariants
Prisma's DSL cannot express at the database layer, not just in
application code.

### AdminUser — a separate identity axis, never granted from a consumer session alone

Mirrors `SellerMembership`/`ProviderUser`'s established "role+status keyed
to a real `User` row" pattern exactly. The consumer session cookie is
still what identifies *who* is calling, but `AdminAccessService
.resolveAdminContext()` always performs a real `AdminUser` lookup
(throwing `AdminAccessDeniedException`/`AdminAccountSuspendedException`
for missing/suspended rows) before any `/admin/*` route treats the caller
as staff — a normal consumer session, however valid, is never itself
sufficient. `AdminAuthGuard` is the enforcement point every admin
controller carries, exactly like `SellerAuthGuard` before it.
`AdminAccessService.getSessionContext()` is the one deliberate exception:
it never throws, returning `{ isAdmin: false, ... }` instead, specifically
so `GET /admin/me` can back a friendly "you are not an admin" screen
rather than surfacing a raw 403 to a consumer who stumbles onto an admin
URL.

### Least-privilege RBAC — a static map, not a database permissions table

`admin-permissions.ts`'s `ROLE_PERMISSIONS` is a plain
`Record<AdminRole, AdminPermission[]>` — the same static-map discipline
`PROVIDER_CAPABILITIES`/`SHIPPING_PROVIDER_CAPABILITIES` already
established — covering 9 roles (`SUPER_ADMIN`, `ADMIN`, `SUPPORT`,
`TRUST_SAFETY`, `FINANCE`, `CATALOG_OPS`, `LOGISTICS_OPS`, `COMPLIANCE`,
`READ_ONLY`) against a 16-value `AdminPermission` union.
`admin.manage` (creating/updating other `AdminUser` rows) is reserved for
`SUPER_ADMIN` alone and never delegated even to `ADMIN`. Every `/admin/*`
route declares its required permission via `@RequireAdminPermission(...)`,
checked inside `AdminAuthGuard` — nav items in the frontend shell filter
by the resolved `permissions` array purely as a UX convenience, never
itself a security boundary, since every route re-checks server-side
regardless of what the UI shows.

### Support Case lifecycle — public/internal visibility strictly enforced

`SupportCaseStatus`: `OPEN → IN_PROGRESS → WAITING_ON_CUSTOMER →
RESOLVED → CLOSED` (plus `REOPENED` looping back to `IN_PROGRESS`),
validated by a plain `SUPPORT_CASE_TRANSITIONS` map in
`support-case-transitions.ts` — never an arbitrary status `PATCH`.
`SupportCase.transition()` acquires a `SELECT ... FOR UPDATE` row lock
(the same concurrency-safety technique `InventoryReservationService`
established in Handoff 06) before re-reading current status and
validating, proven by a dedicated concurrency e2e test where two
concurrent transition calls race and exactly one wins. Every
`SupportMessage` carries an explicit `visibility` (`PUBLIC`/`INTERNAL`):
a customer-facing endpoint only ever returns `PUBLIC` messages, and
`INTERNAL` messages (used for admin-to-admin case handoff notes) are
never reachable through any customer-scoped read path — proven directly
by an e2e assertion that a customer's own case-detail response never
contains an internal message's body. Case numbers are human-readable
(`CASE-000001`) via `nextval('support_case_number_seq')`, generated once
at creation and never reused. Support notifications (a new
public message, a case resolution) reuse Handoff 10's
`NotificationOrchestratorService.notify()` unchanged, through a new
`support.message_posted`/`support.case_resolved` template pair and the
new `SUPPORT` notification category — no parallel notification path.

### Disputes — lifecycle explicitly decoupled from payment/refund state

`Dispute` has **no foreign key to `Refund`** — this is a schema-level
decision, not a runtime guard, so resolving a dispute
(`DisputeStatus.RESOLVED_CUSTOMER`/`RESOLVED_PROVIDER`/
`RESOLVED_SELLER`/`PARTIAL_RESOLUTION`/`REJECTED`) can never, by
construction, auto-trigger a refund; an admin must separately invoke the
refund flow below. Proven by a dedicated e2e test asserting
`prisma.refund.count()` stays at 0 after a dispute transitions to
`RESOLVED_CUSTOMER`. `DisputeEvidence` records statements from either
side (`actorType`: `ADMIN`/`CUSTOMER`/`COUNTERPARTY`) as an append-only
list — evidence is never edited or deleted once submitted. Transitions
go through the same `SELECT ... FOR UPDATE`-guarded `DISPUTE_TRANSITIONS`
map pattern as Support Cases.

### Trust & Safety — operational-state mutation, never hard-delete

`TrustCase`/`TrustAction` follow the same guarded-transition pattern
(`TRUST_CASE_TRANSITIONS`). `TrustActionService.take()`'s
`operationalUpdateFor(subjectType, actionType)` maps a
`SUSPEND`/`RESTORE`/`REQUIRE_REVERIFICATION` action to a real field
update — `ProviderOrganization.verificationStatus` or
`SellerOrganization.status`/`verificationStatus` — **never a `DELETE`**,
matching the spec's "prefer explicit operational states over destructive
actions" requirement exactly. `USER`/`HOUSEHOLD`/`LISTING`/`REVIEW`/
`COMMUNITY_CONTENT`/`PET_INCIDENT` subjects record the `TrustAction`
(and its audit trail) but have no enforcement field yet on their own
models — a deliberate scope reduction, see Known limitations. Every
trust action a subject can contest is appealable via `Appeal`
(`SUBMITTED → UNDER_REVIEW → UPHELD/OVERTURNED`), reviewed by an admin
distinct from — but not necessarily different in role from — whoever took
the original action (no enforced two-person separation here, unlike
refunds below).

### Two-person control for high-risk refunds — wrapping, never replacing, Handoff 07's `RefundsService`

`AdminRefundService` never mutates the ledger directly and never
duplicates `RefundsService.request()`'s own logic — it calls that
existing method with the order's own true `userId`, which trivially and
correctly satisfies `RefundsService`'s pre-existing ownership check
(`order.userId !== userId`) with zero changes to Handoff 07 code. Below
`ADMIN_REFUND_APPROVAL_THRESHOLD_IRR` (env-configurable, default
5,000,000 IRR), a single `FINANCE` admin can go straight from
`REQUESTED` to `EXECUTED`; at or above the threshold, a *different* admin
must `APPROVE` first — enforced both in `AdminRefundService.approve()`
(application-layer check) and by the
`admin_refund_approvals_approver_not_requester` `CHECK` constraint at the
database layer, so the invariant holds even against a bug that bypasses
the service. `execute()` is the only method that ever calls
`RefundsService.request()`, and does so behind the same
`SELECT ... FOR UPDATE` row-lock pattern used elsewhere in this handoff —
a second `execute()` call against an already-`EXECUTED` approval is a
safe no-op that returns the same `refundId`, proven by a dedicated
concurrency e2e test. `AdminRefundService.request()` uses the same
idempotency-key two-phase-claim pattern
`MarketplaceOrderIngestionService`/`NotificationOrchestratorService`
established: a plain `create()`, catching Prisma `P2002` on the unique
`idempotencyKey` and returning the existing row instead of erroring.

### Customer/Household/Pet 360 + PII masking

`Customer360Dto` is an application-code composition — the same
"aggregate several existing tables' own queries into one view" approach
Handoff 09's Unified Seller Orders view already used — not a new
event-warehouse table (the internal `DomainEvent` outbox has no direct
`userId`/`householdId` columns to query by). Its `activityTimeline` maps
and concatenates orders/bookings/support cases/disputes/notifications
into one `{type, id, summary, occurredAt}` shape, sorted descending. PII
(email, phone) is masked by default in every admin-facing read
(`maskEmail()`, alongside Handoff 10's existing `maskPhone()`); an
explicit reveal endpoint always writes an `AdminAuditLogService.record()`
call with action `pii.revealed` before returning the unmasked value —
proven by an e2e test that the masked field in a subsequent Customer 360
read is unchanged after a reveal (reveal is a one-time response, never a
stored unmask). Operational search
(`AdminSearchController`) is Postgres-only, via Prisma `contains`/exact
UUID matching — no external search index, per the spec's own "no
Elasticsearch this phase" allowance.

### Auditability — every sensitive action, reason-required where it matters

`AdminAuditLogService.record()` is the single write path for the audit
trail (`AdminAuditLog`), called from every mutating admin service —
support/dispute/trust transitions, PII reveals, refund
approve/reject/execute, verification changes, trust actions. Sensitive
actions (trust actions, refund approve/reject, PII reveal) require a
non-empty `reason` at the DTO layer, enforced by `class-validator`, not
left as an optional field a caller can silently omit. `GET /admin/audit`
requires the `audit.view` permission, which `SUPPORT`/`TRUST_SAFETY`
deliberately do not carry by default (least privilege) — an `ADMIN` or
`SUPER_ADMIN` is required to review the trail.

### Frontend — a distinct Admin shell, operational density over spaciousness

`apps/web/features/admin/AdminShell.tsx` is a separate shell from
`SellerShell`/`ProviderShell` — no org-switching concept, since an
`AdminUser` has exactly one role — with visibly tighter padding
(`py-2.5`/`py-1.5` header/nav, `max-w-4xl px-4 py-4` main) reflecting the
spec's explicit "operational density, not an excessively spacious
consumer-style UI" requirement. `use-admin-bootstrap.ts`/`admin-store.ts`
mirror the established `useSellerBootstrap`/`seller-store.ts` shape
exactly, including the `"not-an-admin"` status the `/admin/me` bootstrap
above exists to support. Reuses `@petlife/ui`'s existing
`Button`/`ContextSurface`/`Input`/`Select`/`StatusLabel`/`Skeleton`/
`EmptyState`/`ErrorRecovery` — no `Dialog`; every admin form is an inline
compose surface, not a modal, matching an ops-tool feel over a
consumer-app one. Full Persian RTL / English LTR support via the new
`"admin"` message namespace in both `en.json`/`fa.json`.

### API endpoints (Handoff 11 additions)

```
GET    /admin/me
GET    /admin/dashboard
GET    /admin/search?q=

GET    /admin/customers                          (paginated/filterable)
GET    /admin/customers/:userId/360
POST   /admin/customers/:userId/reveal-pii        (audited)
POST   /admin/notes                               (entityType + entityId; append-only)

GET    /admin/support-cases                       (paginated/filterable)
POST   /admin/support-cases
GET    /admin/support-cases/:id
PATCH  /admin/support-cases/:id/assign
PATCH  /admin/support-cases/:id/transition
POST   /admin/support-cases/:id/messages          (visibility: PUBLIC | INTERNAL)

GET    /admin/disputes                            (paginated/filterable)
POST   /admin/disputes
GET    /admin/disputes/:id
PATCH  /admin/disputes/:id/assign
POST   /admin/disputes/:id/evidence
PATCH  /admin/disputes/:id/transition

GET    /admin/trust-cases                         (paginated/filterable)
POST   /admin/trust-cases
GET    /admin/trust-cases/:id
PATCH  /admin/trust-cases/:id/assign
PATCH  /admin/trust-cases/:id/transition
POST   /admin/trust-cases/:id/actions             (reason required)
POST   /admin/trust-actions/:actionId/appeals
PATCH  /admin/appeals/:id/resolve

PATCH  /admin/providers/:id/verification
PATCH  /admin/sellers/:id/verification
GET    /admin/providers
GET    /admin/sellers

GET    /admin/tasks                               (paginated/filterable)
POST   /admin/tasks
PATCH  /admin/tasks/:id

GET    /admin/orders/:orderId/financials          (read-only)
POST   /admin/refunds/request                     (Idempotency-Key supported)
GET    /admin/refunds/:id
PATCH  /admin/refunds/:id/approve                 (reason required; approver ≠ requester)
PATCH  /admin/refunds/:id/reject                  (reason required)
PATCH  /admin/refunds/:id/execute                 (idempotent — re-executing an EXECUTED approval is a safe no-op)

GET    /admin/audit                               (paginated/filterable; requires audit.view)
```

### Error codes (Handoff 11 additions)

```
ADMIN_ACCESS_DENIED               403  the caller's session has no matching AdminUser row at all
ADMIN_ACCOUNT_SUSPENDED           403  an AdminUser row exists but its status is SUSPENDED
ADMIN_PERMISSION_DENIED           403  a real admin, but their role lacks the permission the route requires
ADMIN_INVALID_TRANSITION          400  a support case / dispute / trust case status PATCH that isn't a valid transition from its current status
SUPPORT_CASE_NOT_FOUND            404
DISPUTE_NOT_FOUND                 404
TRUST_CASE_NOT_FOUND              404
ADMIN_REFUND_ALREADY_EXECUTED     409  a second execute() call — returns the original refundId instead in the idempotent path, this is for a conflicting concurrent state only
ADMIN_REFUND_APPROVAL_REQUIRED    400  attempted execute()/a self-approval below the correct authorization level
ADMIN_REFUND_SELF_APPROVAL        400  the same admin who requested a refund attempted to approve it
ADMIN_REASON_REQUIRED             400  a sensitive action (trust action, refund approve/reject, PII reveal) submitted without a non-empty reason
```

## Authentication: Google + Phone + Password + Public Browsing (Handoff 12)

Schema: `prisma/migrations/20260903120000_auth_google_password_identities`
(purely additive: `AuthIdentity` and `PasswordResetToken` models, three new
nullable `User` columns — `username`, `normalizedUsername` (unique),
`passwordHash` — plus one hand-appended change: the Handoff 01
schema-hardening CHECK constraint requiring `email IS NOT NULL OR phone IS
NOT NULL` is replaced, not just extended, with one that also accepts
`normalizedUsername IS NOT NULL`, since a password-only account has
neither an email nor a phone).

### `AuthIdentity` — links an OAuth provider to exactly one User, never a duplicate

OTP (email/phone) and username/password continue to resolve identity
exactly as before — directly against `User.email`/`User.phone`/
`User.normalizedUsername`, a 1:1 relationship by construction that needed
no new table. Google (and any future OAuth/OIDC provider) is different:
the same person can plausibly already have an account via OTP or
password, so `AuthIdentity` (`{provider, providerAccountId}` →
`userId`, unique on both `(provider, providerAccountId)` and `(userId,
provider)`) is the one place that link lives.
`AuthGoogleService.resolveUser()` is the single resolution path every
Google sign-in goes through: (1) an existing `AuthIdentity` for this
Google account signs straight in; (2) otherwise, a **verified** Google
email matching an existing `User.email` links the two — a new
`AuthIdentity` row, never a second `User`; (3) otherwise, a new `User` +
`AuthIdentity` are created together. An *unverified* Google email is
never trusted for either linking or creation (`emailVerified !== true`
â†’ `GoogleAuthFailedException`) — a spoofable address must never be able
to claim an existing account. Two concurrent sign-ins for the same
brand-new Google account race safely: the loser's `AuthIdentity.create()`
hits the unique constraint and re-reads the winner's row instead of
erroring, the same claim-then-recover pattern established across H09/H10.

### Google OAuth — a real Authorization Code flow, off by default, no fake login

`GOOGLE_AUTH_ENABLED` (default `false`) gates the entire feature,
mirroring the `*_ENABLED` + startup-`validate*Config()` pattern every
prior external provider (Payment/Shipping/Marketplace/Messaging) already
established — enabling it without `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL` all set fails startup rather
than booting half-configured. `AuthGoogleController`'s `GET /auth/google`
builds the authorization URL and stores `{state, nonce, returnTo}` in a
short-lived (10-minute) signed, httpOnly cookie — the OAuth equivalent of
the session cookie's own HMAC scheme — since both ends of the handshake
are full browser redirects with no shared request-scoped memory. `GET
/auth/google/callback` verifies the cookie's signature and expiry,
confirms the `state` query param matches, exchanges the code for tokens
over a real server-to-server call to Google, and verifies the id_token's
signature against Google's own JWKS (via `jose`) plus its issuer,
audience, and nonce, before ever calling `AuthGoogleService`. Unlike
every prior external-provider integration in this codebase, there is no
"DevGoogleAdapter" simulating a sandbox response — verifying a third
party's real cryptographic signature has no honest local simulation.
Instead, `POST /dev/auth/google/simulate` (dev/test-only, disabled in
production) hands `AuthGoogleService` an already-"verified" profile
directly, exercising the exact same resolve-or-create-user logic the
real callback uses, without ever touching the network — the same
"dev/simulate drives the real pipeline" discipline the notification and
marketplace dev controllers already use.

### Username + password — Argon2id, enumeration-resistant, case-insensitive

`User.username` is stored case-preserved; `normalizedUsername`
(lowercased, unique) is the actual identity key, so "Sarah" and "sarah"
are the same account. Passwords are hashed with Argon2id
(`common/password/password-hash.util.ts`) — the OWASP-recommended default
for a new password store, unlike the fast SHA-256 this codebase already
uses for short-lived OTP codes and HMAC cookie signing, which would be
inappropriate for a long-lived credential. `AuthPasswordService.login()`
always calls `verifyPassword()` — against a fixed dummy hash when the
username doesn't exist at all — so a nonexistent username and a wrong
password take the same code path and return the identical
`INVALID_CREDENTIALS` error with no timing signal either could exploit to
distinguish "no such account" from "wrong password" (spec:
enumeration-resistant errors). `PUT /auth/password` doubles as both "set
a password for the first time" (an OTP-only or Google-only account,
`currentPassword` omitted) and "change an existing one" (`currentPassword`
required and verified) — never confusable, since the service branches on
whether `User.passwordHash` is already set.

### Password reset — single-use hashed token, reset revokes every session

`AuthPasswordResetService.requestReset()` accepts a username or email,
looks it up, and — regardless of whether it matched anything — returns
the same generic `{ ok: true }`, mirroring the login enumeration-resistance
above at the account-recovery entry point too. On a match, a random token
is generated and only its SHA-256 hash is ever persisted
(`PasswordResetToken.tokenHash`) — the same "never store the literal
secret" discipline `DevOtpProvider` already applies to OTP codes. There is
no transactional-email infrastructure in this codebase (OTP delivery is
its own Redis-backed provider, not a general mailer), so — exactly
mirroring `DevOtpProvider`'s own dev-only console logging — the raw reset
token is logged to the server console rather than actually emailed; a
production deployment needs a real mail provider wired in here before
launch, the same pre-existing TODO OTP delivery already carries (see
Known limitations). `resetPassword()` is single-use (`usedAt` set
atomically with the password update) and, on success, calls the new
`SessionService.revokeAllForUser()` — a credential reset must invalidate
every existing session, including one an attacker who compromised the
old password may currently hold.

### Public browsing — discovery is public, actions stay gated

Per spec ("do NOT globally auth-gate PET LIFE OS"), vet/service/shop
discovery moved from requiring `SessionAuthGuard` to a new
`OptionalSessionAuthGuard`: it resolves `request.user` when a valid
session cookie is present but never throws when one is absent, so the
exact same endpoint personalizes results for a signed-in caller (pet-
compatibility checks) while remaining fully reachable anonymously.
`ProductCompatibilityService.evaluate()`'s health-permission check
(`requestingUserId` is now optional) degrades to the same "no permission
→ NEEDS_REVIEW" branch a signed-in non-member already got — an anonymous
caller is never granted elevated access, only ever the same default a
stranger already had. On the frontend, vet/services/shop discovery moved
to a new `(public)` route group under a lightweight `PublicShell` (full
`useAppBootstrap` — session **and** household/pet context, so a signed-in
visitor keeps their active-pet personalization on these pages exactly as
before — but, unlike `AppShell`, it never redirects an anonymous visitor
away). Booking-creation pages (`vet/[id]/book`,
`services/[category]/[id]/book`) stay inside that same public tree but
individually self-gate with a new `<RequireAuth>` wrapper — "auth-on-
action," matching the spec's own example exactly (open a vet profile
anonymously, click Book, authenticate, land back on the booking wizard —
never bounced to Home). `ProductDetailView`'s "Add to cart" button
follows the same pattern via a plain 401 check, since Cart/Checkout/
Orders remain fully private and were never moved.

### Safe `returnTo` — one allow-list shape, shared by every auth method

`sanitizeReturnTo()` exists in two copies with identical logic — one in
`apps/api/src/common/return-to/` (the real security boundary for the
Google OAuth redirect, which the API fully controls) and one in
`apps/web/lib/auth/` (so the OTP/password flows, which redirect entirely
client-side via `next/navigation`, apply the same allow-list before ever
calling `router.replace` with a caller-supplied path). Only a path
starting with a single `/` — never `//host`, `/\host`, an embedded
scheme, or a decoded control character — is accepted; anything else
degrades to a safe fallback rather than erroring, since a bad `returnTo`
should never break the login flow itself. `resolvePostAuthDestination()`
(frontend) is the one place every sign-in method — OTP's `account/page.tsx`,
password login, registration, and the Google callback's `/auth/complete`
landing page — decides where to go next: an incomplete-onboarding account
always goes to `/onboarding` first (carrying `returnTo` along as a query
param for `ReadyStep` to finish with), and only a completed account is
sent straight to its original `returnTo` — "Auth != onboarding" enforced
in exactly one function, not reimplemented per sign-in method.

### `/auth/complete` — the one page a real (not dev-simulated) Google login needs

Every sign-in method except Google resolves its own post-auth destination
inline, since each already has a JS context to redirect from the moment
the API call resolves. A real Google OAuth callback is a server-driven
full-page redirect with no such context — `AuthGoogleController` redirects
to `${WEB_APP_ORIGIN}/auth/complete?returnTo=...` on success (or
`/welcome?error=google_auth_failed` on any failure, never a bare JSON
error to a browser mid-navigation), and this new page simply resolves the
now-set session cookie, then applies the exact same
`resolvePostAuthDestination()` every other method uses.

### Local dev — a username/password demo account needs no OTP log-reading

`prisma/seed.ts` seeds a `demo` / `dev-only-password` account (household,
one pet, onboarding already `COMPLETED`), written idempotently
(existence-checked before any create, unlike the pre-existing Sarah seed
path — see Known limitations) so re-running `pnpm db:seed` is always
safe. This is the first fully self-contained "run locally → log in →
immediately see the real product" path in this codebase that needs no
server-log-reading step at all (Sarah's own OTP-based seed still requires
reading the printed code from the API log, exactly as before).

### API endpoints (Handoff 12 additions)

```
GET    /auth/methods                    (which of google/phone/password are actually available — never requires a session)
GET    /auth/google                     (redirects to Google's consent screen)
GET    /auth/google/callback            (redirects to /auth/complete or /welcome?error=... — never a JSON response)
POST   /auth/register                   (username + password [+ optional displayName/email])
POST   /auth/login/password
PUT    /auth/password                   (authenticated; sets a first password or changes an existing one)
POST   /auth/password/forgot            (always resolves the same way regardless of match)
POST   /auth/password/reset             (single-use token; revokes every existing session on success)

POST   /dev/auth/google/simulate        (dev/test-only; hard-disabled in production; bypasses the real network round trip)

GET    /shop/categories                 (no longer requires a session — Handoff 12)
GET    /shop/products                   (no longer requires a session)
GET    /shop/products/:id               (no longer requires a session)
GET    /providers/vets                  (no longer requires a session)
GET    /providers/vets/:providerId      (no longer requires a session)
GET    /services/categories             (no longer requires a session)
GET    /providers/services              (no longer requires a session)
GET    /provider-services/:serviceId    (no longer requires a session)
```

### Error codes (Handoff 12 additions)

```
INVALID_CREDENTIALS          401  wrong password OR a nonexistent username — deliberately identical either way
USERNAME_TAKEN                409  registration with an already-used (case-insensitive) username
WEAK_PASSWORD                 400  reserved for a non-HTTP caller bypassing the DTO's own min-length check
CURRENT_PASSWORD_INCORRECT    400  wrong currentPassword on PUT /auth/password, or omitted when one is required
GOOGLE_AUTH_DISABLED           503  GOOGLE_AUTH_ENABLED is false (or unconfigured) — never a silent fake login
GOOGLE_AUTH_FAILED             400  any real-flow failure: bad/expired state, failed token exchange, invalid id_token, or an unverified email
ACCOUNT_LINKING_CONFLICT      409  reserved for a future case where a verified identity resolves to a conflicting existing account
PASSWORD_RESET_TOKEN_INVALID  400  reset token missing/expired/already used — the request step itself never reveals which
INVALID_RETURN_TO             400  a returnTo value rejected by sanitizeReturnTo — used by non-redirect callers only; a redirect flow degrades to a safe fallback instead
```

## User Support Tickets + Admin CRM Enhancements (Handoff 13)

Schema: `prisma/migrations/20260903130000_support_case_sla_timestamps`
(purely additive: three nullable `DateTime` columns on `SupportCase` —
`firstResponseAt`, `lastUserMessageAt`, `lastAdminMessageAt` — the SLA
foundation the spec explicitly asked for without "a complex SLA engine
yet": raw timestamps only, with first-response-time/resolution-time
computed on read, never a separately maintained metric row). No new
models — this handoff builds the consumer-facing half of the Support Case
system Handoff 11 already modeled, and narrowly extends the admin half.

Note on Handoff 11's own README section above: it was written against an
earlier draft of the schema and predates this handoff's verification pass
against the live code — the actual `SupportCaseStatus` values are `OPEN`,
`IN_PROGRESS`, `WAITING_ON_USER`, `WAITING_ON_INTERNAL`, `RESOLVED`,
`CLOSED` (no separate `REOPENED` state — see reopen below), and the live
routes are `/admin/support/*`, not `/admin/support-cases/*`. This section
and the "API endpoints" reference below reflect the real, current surface.

### One `SupportCaseService`, two controllers — never two ticket systems

The spec's hardest constraint ("do NOT create separate 'user tickets' and
'admin tickets' systems") is met structurally, not by convention: the new
consumer-facing `apps/api/src/modules/support/` module has no
`SupportCase`-related Prisma calls of its own at all. `SupportModule`
imports `AdminModule` and injects the exact same `SupportCaseService`
instance `SupportCaseController` (`/admin/support`) already used —
`AdminModule` now exports it alongside its existing exports — so
`UserSupportController` (`/support/cases`) and the admin controller are
two thin HTTP-shaped views over one service, one set of tables, one
transaction boundary. `SupportCaseService` gained five additive methods
(`createAsUser`, `listForUser`, `getForUser`, `postMessageAsUser`,
`reopen`) alongside its existing admin-facing ones; nothing existing was
renamed or restructured, so all 14 pre-existing Handoff 11 support e2e
tests still pass unchanged.

### Consumer DTOs are a structurally different shape, not a filtered admin shape

`SupportCaseUserSummaryDto`/`SupportCaseUserDetailDto` (new,
`@petlife/types`) are built from scratch rather than derived from the
admin `SupportCaseSummaryDto`/`SupportCaseDetailDto` — they have no
`priority` field and no `assignedAdmin` field at all (not omitted at
serialization time; the TypeScript type has no such property), and the
detail variant has no `internalNotes` field, structurally, satisfying the
spec's hard requirement that "INTERNAL messages / notes must NEVER be
visible through consumer APIs." `SupportCaseService.getForUser()` only
ever queries `SupportMessage` rows `WHERE visibility = PUBLIC` — an
`INTERNAL` row never enters process memory on the consumer read path, let
alone the response; proven by an e2e test that posts both an internal note
and an `INTERNAL`-visibility message, then asserts a user's own
case-detail read contains neither body. The raw `SupportCaseStatus` is
translated to a five-value `UserFacingSupportCaseStatus`
(`SUBMITTED`/`UNDER_REVIEW`/`WAITING`/`RESOLVED`/`CLOSED`) by
`toUserFacingStatus()` in `support-case.mapper.ts` — `IN_PROGRESS` and
`WAITING_ON_INTERNAL` both collapse to `UNDER_REVIEW` (a customer has no
way to act on "we're stuck internally" differently than "we're working on
it"), and only `WAITING_ON_USER` gets its own `WAITING` label.

### Priority can never be set by a normal user — there is no field to set

The spec's "do not let normal users arbitrarily mark every ticket URGENT"
is enforced the same way as the internal-notes rule above: the consumer
create DTO (`CreateMySupportCaseDto`) has no `priority` property, and the
global `ValidationPipe`'s `forbidNonWhitelisted: true` means a client that
sends one anyway gets a `400 VALIDATION_ERROR`, not a silently-dropped
field — `SupportCaseService.createAsUser()` always writes
`AdminPriority.NORMAL` via the Prisma model default. `requesterUserId` is
similarly absent from the DTO; the session's own user ID is the only
possible requester, so there is no impersonation surface to guard against.

### IDOR-safe reference validation for user-created cases

A user can link their own case to a household, a pet, or one of two
entity kinds (`relatedEntityType`: `ORDER` | `BOOKING`, enforced by
`@IsIn` at the DTO layer — the only two contextual entry points the spec
asks for). `SupportCaseService.assertUserOwnsReferences()` validates each
reference before the case is created: a `HouseholdMember` row must exist
for `(householdId, userId)`; `petId` ownership reuses
`PetAccessService.hasActiveAccess()` unchanged; `ORDER`/`BOOKING`
ownership checks mirror `OrdersService.getById()`/`BookingsService
.getById()`'s own patterns (`order.userId === userId`, or for a booking,
`booking.userId === userId || petAccess.hasActiveAccess(booking.petId,
userId)`) without importing those services directly, avoiding a new
cross-module dependency for a check that's three lines of Prisma. Every
failure path throws the same generic `SupportCaseInvalidReferenceException`
regardless of which reference failed, so a client can't use the error to
enumerate which IDs exist — proven by an e2e test asserting a case
referencing another user's order, booking, or household is rejected with
`400 SUPPORT_CASE_INVALID_REFERENCE`, while a reference to the caller's
own order succeeds.

### Reopen — a narrower, user-triggered sibling of the admin transition map

`SUPPORT_CASE_TRANSITIONS` (the admin-facing state machine) is untouched;
widening it to add a user-reachable `RESOLVED/CLOSED → OPEN` edge would
have blurred which actor can trigger which edge (the admin's own
`RESOLVED → IN_PROGRESS` "reopen for internal work" already exists there
with different semantics). Instead, `SupportCaseService.reopen(userId,
caseId)` is its own method: row-locks the case (`SELECT ... FOR UPDATE`,
the same `InventoryReservationService`-established pattern Handoff 11
already used for `transition()`), requires the caller to be the case's own
requester, requires the current status to be `RESOLVED` or `CLOSED`, and
sets it to `OPEN`. A dedicated concurrency e2e test fires two simultaneous
reopen calls against the same resolved case and asserts exactly one
succeeds (`201`) and the other is rejected (`409
INVALID_SUPPORT_CASE_REOPEN`) rather than both silently succeeding.

### A user's own reply hands `WAITING_ON_USER` back to the queue automatically

`postMessageAsUser()` is the one deliberate, narrow exception to "no
arbitrary status PATCH": if the case is currently `WAITING_ON_USER` when
the user replies, it auto-transitions to `IN_PROGRESS` in the same
transaction as the message insert — the exact event that status was
waiting for. Any other status is left untouched. The method also
maintains `lastUserMessageAt`, and the mirroring admin-side `postMessage()`
now maintains `lastAdminMessageAt` and (gated on `visibility === PUBLIC`,
set only once) `firstResponseAt` — the two SLA foundation fields the spec
asked for, with no derived-metric table alongside them.

### Notifications — one new "more information requested" case, self-notification guarded against

`SupportNotificationListener` gained two new `@OnEvent` handlers
(`SupportCaseStatusChanged` filtered to `to === WAITING_ON_USER`, mapped
to a new `support.more_info_requested` template; `SupportCaseClosed`,
mapped to `support.case_closed`) alongside the pre-existing
`SupportMessagePosted`/`SupportCaseResolved` handlers — covering every
"notify user when" case the spec lists (support replies, status
meaningfully changes, case resolved, more information requested). The
existing `SupportMessagePosted` handler gained an `authorType` guard: a
user's own message now publishes `SupportMessagePosted` too (for a future
admin-side "customer replied" indicator), but the listener skips
notifying when `authorType === USER` — a user must never be notified
about their own message. Proven by an e2e test asserting no
`support.message_posted` notification is created for the message's own
author.

### Admin context panel + queue filters

`GET /admin/support/:id/context` (new) resolves the pieces Handoff 11's
detail view never surfaced: the linked household/pet by name (not just
ID), a human-readable summary of the linked Order/Booking, the requester's
other support cases, and the two derived SLA durations
(`firstResponseTimeMinutes`, `resolutionTimeMinutes`, both computed on
read from the raw timestamps, `null` until the corresponding event has
happened). `AdminSupportCaseDetailView.tsx` renders it as a new context
card. `GET /admin/support` gained `category`, `search` (case-insensitive
substring match against subject or case number, mirroring the existing
`admin-customer.service.ts`/`admin-org.service.ts` search precedent), and
`createdFrom`/`createdTo` date-range filters, all optional and additive to
the existing `status`/`assignedAdminId` filters; `AdminSupportQueueView.tsx`
exposes them as filter controls. The admin RBAC permission scheme
(`support.view`/`support.manage`, two permissions) is intentionally left
as-is rather than split into finer-grained permissions (e.g. separate
assign/resolve permissions) — the existing two-tier scheme already
satisfies "UI-hiding-isn't-security" (every route re-checks server-side),
and splitting it further would touch every existing role grant for a
capability this handoff's spec didn't explicitly require.

### Consumer frontend — Support Home, My Tickets, Create Ticket, Ticket Detail

Four new pages under the existing `(app)` route group (already
auth-gated by `AppShell`, so no new gating logic was needed):
`/support` (Support Home — a create-ticket CTA plus a short recent-tickets
preview), `/support/tickets` (the full ticket history, open and closed
alike), `/support/new` (create form, prefillable via `relatedEntityType`/
`relatedEntityId`/`category` query params), `/support/tickets/:id` (ticket
detail — a three-step simplified progress tracker collapsing
`WAITING`/`UNDER_REVIEW` into the same visual step since a case can bounce
between them without that reading as regression, the conversation, a
reply box, and a reopen button gated on `RESOLVED`/`CLOSED`). A small
support icon button in `AppShell`'s header is the global entry point
(there is no Profile/Account page yet in this codebase for a literal
"Profile → Support" path — see Known limitations). `OrderDetailView.tsx`
and `BookingDetailView.tsx` each gained a "Get support" button linking to
`/support/new` with `relatedEntityType`/`relatedEntityId`/`category`
pre-filled — the two contextual entry points the spec requires.

### API endpoints (Handoff 13 additions)

```
GET    /support/cases                   (the caller's own cases only, paginated)
POST   /support/cases                   (no requesterUserId, no priority — session-scoped, always NORMAL)
GET    /support/cases/:id               (404 for both "not found" and "not yours" — indistinguishable)
POST   /support/cases/:id/messages      (always authorType USER, always visibility PUBLIC)
POST   /support/cases/:id/reopen        (only from RESOLVED/CLOSED, only the case's own requester)

GET    /admin/support/:id/context       (household/pet/related-entity summaries, previous cases, SLA durations)
GET    /admin/support                   (gained category/search/createdFrom/createdTo filters — additive to status/assignedAdminId)
```

### Error codes (Handoff 13 additions)

```
INVALID_SUPPORT_CASE_REOPEN      409  reopen attempted from a status other than RESOLVED/CLOSED, or by a non-requester (surfaced as 404 for the latter — see cross-user isolation)
SUPPORT_CASE_INVALID_REFERENCE   400  a user-created case's householdId/petId/relatedEntity referenced an entity the caller doesn't own — generic across all three to avoid an enumeration oracle
```

## Marketplace & Seller Financial Settlement (Handoff 14)

Schema: `prisma/migrations/20260903063100_seller_financial_settlement`
(additive: 12 new models/enums — `SellerFinancialAccount`, `CommissionRule`,
`OrderFinancialBreakdown`, `SellerLedgerAccount`/`SellerLedgerTransaction`/
`SellerLedgerEntry`, `SellerSettlement`/`SellerSettlementItem`,
`SellerAdjustment`, `MarketplaceSettlementStatement`/
`MarketplaceSettlementStatementLine`, `MarketplaceReconciliationResult` —
plus a hand-appended `seller_settlement_reference_seq` sequence and a
`seller_settlements_approver_not_initiator` `CHECK` constraint, the exact
two artifacts Prisma's DSL can't express, mirroring `SupportCase.caseNumber`
and `AdminRefundApproval`'s own precedents). This is the piece Handoff 09
deliberately left out ("do not entangle Seller OS's launch with the
ledger") and Handoff 07's own `SELLER_PAYABLE`/`PLATFORM_REVENUE` ledger
accounts sat unused waiting for: nothing in this codebase previously posted
a real seller payable for either a PET LIFE OS checkout order or a
marketplace order. Handoff 07's platform-wide `LedgerService` is extended,
never replaced (two new methods, `recordSellerAttribution`/
`recordMarketplaceCommission`, plus a reversal counterpart), and a brand
new `SellerLedgerService` gives every seller their own private
double-entry subledger — a second, seller-scoped mirror of the exact same
`sum(debits) === sum(credits)`-checked-before-every-write discipline
`LedgerService.recordBalanced()` already enforced, never a looser or
differently-checked variant.

### Order financial attribution — direct and marketplace sales, one snapshot shape

`SellerFinanceService.attributeDirectSale()`/`attributeMarketplaceSale()`
each create exactly one `OrderFinancialBreakdown` row per `Order`
(`@@unique([orderId])` is the idempotency guard, checked by a find-first
before insert) — a direct PET LIFE OS checkout order is attributed inside
`CheckoutService.finalizeSuccessfulPayment()`'s own transaction right
after its `Fulfillment` rows are created; a marketplace order is attributed
inside `MarketplaceOrderIngestionService`'s transaction, before the
`MarketplaceOrderReceived` event publishes, so a seller's finance summary
and their orders list become consistent in the same instant. Both paths
resolve a commission rate through `CommissionRuleService` (seller-specific
+ channel-specific rows beat seller-specific-any-channel beat
channel-specific-any-seller beat the platform default — seeded at 1000
basis points, 10.00%, in `seed.ts`; category-level commission is a
documented non-goal this phase), and both compute
`platformCommissionIrr = order.totalAmount - sellerNetIrr` — a *derived
balancer*, never an independently-rounded `gross × bps` figure — so the
two-account ledger posting this produces (`recordSellerAttribution` debits
`CUSTOMER_PAYMENT_CLEARING`/credits `SELLER_PAYABLE`+`PLATFORM_REVENUE`
split by that same commission) always balances exactly against what the
customer actually paid, by construction, never by a rounding coincidence.
A marketplace order additionally applies `DEV_MARKETPLACE_SIMULATED_CHANNEL_FEE_BPS`
(a fixed, deterministic 2% simulated channel fee — spec: "DEV marketplace
may use deterministic simulated fee rules... never fabricate a real
provider's fee schedule") and never creates a `PaymentIntent` — a
marketplace customer pays the marketplace, not PET LIFE OS, so
`recordMarketplaceCommission` posts only the platform's own commission
share, never a fabricated full-payment entry (the same "never fabricate
`PaymentIntent` for marketplace-collected payments" invariant Handoff 09
established, carried forward unchanged). `shippingResponsibility` is read
once, at attribution time, from the order's own `Fulfillment` (`PETLIFE`
when none exists — a marketplace order never gets one), so shipping cost
ownership is never assumed.

### The seller subledger and the sweep pattern

`SellerLedgerAccount` mirrors `LedgerAccount`'s own shape per seller —
`RECEIVABLE`/`SALES_INCOME`/`SETTLEMENT_PAID`/`ADJUSTMENT`, seeded
on-demand by `getOrCreateAccount()` — with `RECEIVABLE`'s running balance
*being* the seller's payable balance (spec: "prefer a derived balance from
ledger/subledger entries... never a mutable summary column"). Every
mutation — a sale, a refund, an adjustment, a settlement payment/reversal —
posts through `SellerLedgerService.recordBalanced()` and creates exactly
one append-only `SellerLedgerTransaction`. The one field on that row that
ever changes after creation is `sellerSettlementId`: it starts `NULL` and
flips exactly once, when `sweepTransactions()` claims it into a real
settlement — that single flip is the *entire* idempotency and
double-settlement-protection mechanism. `SellerFinanceReadService
.getBalance()` derives `pendingIrr`/`availableIrr`/`reservedIrr`/`paidIrr`
by joining every `RECEIVABLE` entry to its transaction's settlement status
on every read; there is no stored balance column anywhere to drift out of
sync with the entries that are supposed to explain it.

### Settlement lifecycle: Calculate → Approve → Payout, with two-person control

`SellerSettlementStatus` (`CALCULATED → APPROVED → PAID`, or `CANCELLED`
before payout, or `FAILED` after) is deliberately narrower than the
spec's own suggested superset — no `DRAFT`/`READY`/`PROCESSING`/
`PARTIALLY_PAID` — because `calculate()` always produces a fully-computed
settlement in one atomic step (there is no separate "preview" stage; a
caller wanting a preview reads `SellerLedgerService.getUnsweptTransactions`
directly without calling `calculate()`) and this phase's payout is
`MANUAL`-only (no async payout provider ever leaves a settlement
mid-transfer), so `PROCESSING`/`PARTIALLY_PAID` are genuinely
unreachable rather than merely unwired. `AdminSellerSettlementService`
lives inside `AdminModule` (`admin/finance/`), not the seller-finance
domain module — the exact layering precedent `AdminRefundService`
established in Handoff 11, since every mutation here needs
`AdminAuditLogService` and putting it in `SellerFinanceModule` would create
a circular import. `calculate()` selects every `SellerLedgerTransaction`
still unswept for the seller up to `periodEnd`, sweeps them in the same
transaction, and generates a human-readable `reference` ("STL-000123")
from a dedicated Postgres sequence — the same device
`SupportCase.caseNumber` already established. Two-person control mirrors
`AdminRefundApproval` exactly: `initiatedByAdminId`/`approvedByAdminId`
plus the hand-appended `seller_settlements_approver_not_initiator` `CHECK`
constraint, an application-layer self-approval guard
(`SellerSettlementSelfApprovalException`), and a configurable
`SETTLEMENT_APPROVAL_THRESHOLD_IRR` (default 10,000,000 IRR / 1,000,000
Toman) above which `payout()` refuses to proceed without a prior
`APPROVED` transition by a *different* admin
(`SellerSettlementApprovalRequiredException`). A settlement that nets to
zero or negative (refunds fully offsetting the period) is still recorded
`PAID` for bookkeeping continuity, with no `SETTLEMENT_PAYMENT` posting —
`recordBalanced()` rejects non-positive amounts by design.
`cancel()`/`markFailed()` are the two reversal paths: cancelling before any
money moved simply un-sweeps the settlement's transactions (`sellerSettlementId`
back to `NULL`) so the next calculation picks them up again — no ledger
entry needs reversing since nothing was ever paid; marking an already-`PAID`
settlement failed posts a real correcting `SETTLEMENT_PAID`-reversing
transaction instead, never rewriting the paid settlement's own history.

**Idempotency/concurrency** (spec Flows D, M, N): `calculate()`'s sweep is
a single `UPDATE ... WHERE sellerSettlementId IS NULL` — Postgres row-locks
each `SellerLedgerTransaction` during that update, so two concurrent
`calculate()` calls for the same seller/period both read the same unswept
set, but only one can actually claim every row it asked for; the loser's
sweep count comes back short, `calculate()` treats that mismatch as a hard
failure, and the *entire* transaction — including the settlement and item
rows it had just created — rolls back, leaving only the winner's settlement
standing. **This is why the e2e suite logs one expected `ERROR
[ApiExceptionFilter] PrismaClientUnknownRequestError` line during Flow D**
(and again for the analogous refund-race Flow M) — it is the losing
racer's own transaction aborting exactly as designed, not a bug; see Known
limitations. `approve()`/`payout()`/`cancel()`/`markFailed()` each open
with `SELECT ... FOR UPDATE` on the settlement row itself (the same
row-locking discipline `InventoryReservationService` established in
Handoff 06), and `payout()` additionally short-circuits to a plain re-read
when the settlement is already `PAID` — a duplicate payout call (retried
`Idempotency-Key`, or a genuine concurrent double-click) is answered with
the same result rather than a second `SETTLEMENT_PAID` posting, proven by
a dedicated Flow N test asserting exactly one payment transaction exists
afterward.

### Refund and adjustment financial impact

`RefundsService.refundPayment()`/`refundFinancing()` each call
`SellerFinanceService.applyRefundImpact()` inside the exact same
transaction as `LedgerService.recordRefundSucceeded()` — a refund posts a
new, unswept `SellerLedgerTransaction` reversing that seller's share of the
original sale (debiting `RECEIVABLE`, using the same
`platformShareIrr = refundAmountIrr - sellerImpactIrr` derived-balancer
pattern the original attribution used, via
`LedgerService.recordSellerAttributionReversal()`), never editing the
original `OrderFinancialBreakdown` snapshot in place. Because the sweep
flag is the only thing that determines "already settled," a refund's
timing relative to settlement changes nothing about *how* it posts, only
*when* it gets swept: refunding before a settlement exists simply reduces
what the next `calculate()` sweeps (Flow E — the pending receivable shrinks
back toward zero); refunding an order whose settlement was already `PAID`
posts a fresh negative transaction that the *next* settlement picks up as
a negative carry-forward line, never rewriting the already-paid
settlement's own historical numbers (Flow F). `AdminSellerAdjustmentService
.create()` is the sole other write path onto a seller's balance — no
arbitrary balance editing anywhere else in the codebase — requiring
`amountIrr`/`reason`/a closed `SellerAdjustmentReasonCode`
(`SHIPPING_COMPENSATION`/`MANUAL_CREDIT`/`MANUAL_DEBIT`/
`MARKETPLACE_PENALTY`/`CORRECTION`) and posting immediately as its own
unswept `SellerLedgerTransaction`, picked up by whichever settlement
calculates next — exactly like a sale or a refund, never a shortcut around
the same sweep mechanism.

### Marketplace settlement import + reconciliation — honest and non-destructive

No official Torob or Digikala settlement API exists for this project (see
"External provider status" below) — `AdminMarketplaceSettlementService
.import()` accepts an already-normalized statement (`source`: `MANUAL` or
`CSV_IMPORT` this phase; `API` is modeled in the enum for a future real
integration that would need no schema change) rather than building any
CSV-parsing-specific machinery, and `@@unique([marketplaceChannelAccountId,
periodStart, periodEnd])` makes re-importing the same channel/period
converge on the existing statement (a caught `P2002`, mirroring the exact
idempotency pattern `MarketplaceOrderIngestionService` already
established) rather than erroring or duplicating (Flow I). `reconcile()`
runs inside the same transaction as `import()` so a statement is never
left without its findings, even momentarily, and produces one
`MarketplaceReconciliationResult` per statement line — `MATCHED` (exact
amount match against that order's own `OrderFinancialBreakdown
.grossMerchandiseIrr`), `MISMATCH` (a real `variance`), `MISSING_INTERNAL`
(the statement names an external order this codebase never ingested),
`DUPLICATE` (a re-reported already-`MATCHED` external order), or
`REVIEW_REQUIRED` (the matching `MarketplaceOrder` exists but its
`OrderFinancialBreakdown` doesn't yet — ingestion mid-flight) — plus a
reverse pass producing `MISSING_EXTERNAL` for internal marketplace orders
in that same seller/channel/period the statement never mentioned at all.
**Reconciliation never mutates a canonical financial record** (spec:
"mismatch → flag → admin review → explicit adjustment/correction if
needed, NEVER auto-correct") — `resolve()` only ever sets `notes`/
`resolvedByAdminId`/`resolvedAt` on the finding row itself; a genuine
correction is a separate, fully audited `SellerAdjustment` an admin
creates deliberately, through the completely separate service above, with
this service having no code path to the seller ledger at all. A finding
can only be resolved once (`MarketplaceReconciliationAlreadyResolvedException`)
— a reopened finding would be a new row, never an edited one, matching the
ledger's own append-only discipline.

### Admin RBAC — five new `settlement.*`/`sellerFinance.*` permissions, SUPPORT excluded by construction

Five new permissions extend Handoff 11's existing static role-permission
map in `admin-permissions.ts`: `sellerFinance.view` (read-only, added to
`READ_ONLY_PERMISSIONS`) and four settlement mutation grants
(`settlement.calculate`/`settlement.approve`/`settlement.pay`/
`settlement.adjust`). Per the spec's explicit "do NOT give SUPPORT role
settlement authority," `AdminRole.SUPPORT` receives none of the five —
`AdminRole.FINANCE` receives every one including `settlement.pay`
(payout execution is deliberately FINANCE-only, mirroring how refund
execution was scoped in Handoff 11), `AdminRole.SUPER_ADMIN` receives
every one, and `AdminRole.OPERATIONS` receives only `sellerFinance.view`
(visibility without mutation authority) — proven by a dedicated e2e test
(Flow K) asserting a SUPPORT-role admin token is rejected with `403` on
every settlement-mutating route while a FINANCE-role token succeeds.
Every route in `AdminSellerFinanceController` carries the specific
permission it performs, never a single coarse "finance" gate.

### Notifications + audit

Three new notification templates (`settlement.ready`/`settlement.paid`/
`settlement.failed`, fa/en) route through the existing
`NotificationOrchestratorService.notify()` pipeline unchanged — no new
notification infrastructure — via a new `SellerFinanceNotificationListener`
subscribing to `SellerSettlementCalculated`/`SellerSettlementPaid`/
`SellerSettlementFailed`, each deep-linking to the new
`sellerSettlementDetail()` route via `notification-deeplink.util.ts`. Eight
new `AdminAuditAction` values (`seller_settlement.calculated/approved/paid/
cancelled/failed`, `seller_adjustment.created`,
`marketplace_settlement.imported`, `marketplace_reconciliation.resolved`)
extend Handoff 11's existing append-only `AdminAuditLogService` — every
settlement/adjustment/reconciliation mutation is recorded through the
exact same `auditLog.record()` call every other admin-mutating service
already uses, with `reason` required wherever the action is a reversal or
correction (cancel, mark-failed, resolve). `SupportCaseService.getContext()`
gained three new `relatedEntity` branches (`REFUND`/`SELLER_SETTLEMENT`/
`MARKETPLACE_SETTLEMENT_STATEMENT`) resolving to a coarse summary (amount,
status, reference) for the admin support context panel — never a bank
detail, never a raw ledger row.

### Seller OS Finance UI + Admin Finance UI

A new "Finance" nav item in `SellerShell.tsx` reaches four read-only
pages — `/seller/finance` (balance tiles in Toman, next-settlement-eligible
figure, last settlement), `/seller/finance/transactions` (paginated
Order/Gross/Commission/Net/Settlement-status history), `/seller/finance/settlements`
and its `/:id` detail (full gross/commission/refunds/adjustments/net
breakdown plus every swept line item) — gated by the pre-existing
`SellerMembershipRole.FINANCE` (`OWNER`/`ADMIN` always pass, per
`SellerAuthGuard`'s existing precedent), registered inside `SellerOsModule`
rather than `SellerFinanceModule` to avoid a circular import
(`SellerAuthGuard` lives in `SellerOsModule`). Two new Admin workspace
sections — "Seller Finance" (search a seller, inspect balance, drill into
one seller's settlements/adjustments and calculate a new settlement) and
"Reconciliation" (every `MarketplaceReconciliationResult` finding, with a
resolve-with-notes action) — both gated on `sellerFinance.view`, plus a
settlement detail page exposing Approve/Payout/Cancel/Mark-failed actions
each gated on their own specific permission and each disabled/enabled per
the current status (e.g. "Mark payout failed" is only ever reachable from
`PAID`). Every amount anywhere in both UIs still goes through the one
existing `formatCurrency()` helper — IRR stays the sole stored,
authoritative unit; Toman is a display-only ÷10 transform, exactly as
every prior handoff's UI already established.

### External provider status

```
Torob      settlement/payout API:  NOT AVAILABLE — no official docs/credentials exist for this project
Digikala   settlement/payout API:  NOT AVAILABLE — no official docs/credentials exist for this project
```

Both remain exactly what Handoff 09 already documented them as
(`DevMarketplaceAdapter`-backed sandbox boundaries for publish/sync/
order-ingestion) — this handoff adds no new marketplace-adapter surface
and fabricates no settlement endpoint for either. What this handoff does
build, honestly, is the *internal* half: expected-settlement computation
(`OrderFinancialBreakdown.grossMerchandiseIrr` per marketplace order) and
manual/CSV-shaped statement import + reconciliation against it — the exact
"if official settlement APIs are unavailable, build the internal
settlement domain and reconciliation foundation honestly" the spec asked
for. A future handoff with real Torob/Digikala settlement credentials
would add an `API`-sourced importer (the enum value already exists) and
possibly a scheduled pull, without changing `OrderFinancialBreakdown`,
`SellerLedgerService`, or the reconciliation matching logic at all.

### API endpoints (Handoff 14 additions)

```
GET    /seller-organizations/:sellerId/finance/summary        (FINANCE role; account + derived balance + last settlement)
GET    /seller-organizations/:sellerId/finance/transactions   (FINANCE role; paginated Order/Gross/Commission/Net/Settlement-status history)
GET    /seller-organizations/:sellerId/settlements            (FINANCE role)
GET    /seller-organizations/:sellerId/settlements/:id        (FINANCE role; full item breakdown)

GET    /admin/seller-finance                                  (sellerFinance.view; search + paginate every seller's balance)
GET    /admin/seller-finance/:sellerId                        (sellerFinance.view)
GET    /admin/seller-finance/:sellerId/adjustments             (sellerFinance.view)
POST   /admin/seller-finance/:sellerId/adjustments             (settlement.adjust; Idempotency-Key supported)

GET    /admin/settlements                                     (sellerFinance.view; optional sellerOrganizationId filter)
GET    /admin/settlements/:id                                 (sellerFinance.view)
POST   /admin/settlements/calculate                            (settlement.calculate; Idempotency-Key supported)
POST   /admin/settlements/:id/approve                          (settlement.approve; rejects self-approval)
POST   /admin/settlements/:id/payout                           (settlement.pay; Idempotency-Key supported; requires prior APPROVED at/above the configurable threshold)
POST   /admin/settlements/:id/cancel                           (settlement.adjust; reason required)
POST   /admin/settlements/:id/mark-failed                      (settlement.adjust; reason required; reverses a PAID settlement)
POST   /admin/settlements/:id/adjustments                      (settlement.adjust; Idempotency-Key supported — spec's literal route shape, :id only resolves which seller)

POST   /admin/marketplace-settlements/import                   (settlement.calculate; Idempotency-Key supported; re-importing the same channel/period converges, never duplicates)
GET    /admin/marketplace-settlements                          (sellerFinance.view; optional sellerOrganizationId filter)
GET    /admin/marketplace-settlements/:id                      (sellerFinance.view)
GET    /admin/marketplace-reconciliation                       (sellerFinance.view; optional status filter)
GET    /admin/marketplace-reconciliation/:id                   (sellerFinance.view)
POST   /admin/marketplace-reconciliation/:id/resolve            (settlement.adjust; notes required; never mutates any financial row)
```

### Error codes (Handoff 14 additions)

```
NEGATIVE_PLATFORM_REVENUE                    409  an order's discount exceeds the commission that would normally fund it — not supported this phase
SELLER_SETTLEMENT_NOT_FOUND                  404
INVALID_SELLER_SETTLEMENT_TRANSITION         409  a status transition outside CALCULATED→APPROVED→PAID / →CANCELLED / PAID→FAILED
SELLER_SETTLEMENT_SELF_APPROVAL              409  the admin who calculated a settlement attempted to also approve it
SELLER_SETTLEMENT_APPROVAL_REQUIRED          409  payout attempted at/above SETTLEMENT_APPROVAL_THRESHOLD_IRR without a prior APPROVED transition by a different admin
SELLER_ADJUSTMENT_NOT_FOUND                  404
MARKETPLACE_SETTLEMENT_STATEMENT_NOT_FOUND   404
MARKETPLACE_RECONCILIATION_RESULT_NOT_FOUND  404
MARKETPLACE_RECONCILIATION_ALREADY_RESOLVED  409  a finding can only be resolved once — a reopened finding is a new row, never an edited one
```

## CMS + Blog + Content Management (Handoff 15)

Schema: `prisma/migrations/20260904000000_cms_content_management`
(additive: 12 new models/enums — `ContentAuthor`, `Category`/`CategoryLocale`,
`Tag`/`TagLocale`, `MediaAsset`, `Article`/`ArticleLocale`/`ArticleTag`,
`ContentVersion`, `ContentPlacement`/`ContentBlock`/`ContentBlockLocale` —
plus `ArticleLifecycleStatus`/`ContentPlacementKey` enums and a new
`AdminRole.EDITOR` value). This is PET LIFE OS's first internal content
control plane: admins/editors create, edit, preview, publish, hide, archive,
localize, version, and restore structured content, with Blog/Guides as the
first consumer surface and typed hooks Landing/Home can consume later
without this handoff touching Codex's own Landing visual implementation at
all. Per the spec's explicit scope line, **no AI content generation/
editing/SEO/translation and no social publishing exist anywhere in this
handoff** — every article is human-authored and human-published through the
admin CMS workspace.

### Domain model — typed content, not a page builder

`Article` is the language-neutral shell (author, category, cover image, tags,
`createdByAdmin`) with **no status field of its own**; `ArticleLocale` is the
actual per-locale editorial row (title/slug/excerpt/body/SEO fields) and
carries its *own* `status: ArticleLifecycleStatus` — the same
"derive/scope state where it actually varies, never one shared boolean"
discipline `SellerLedgerAccount` and `OrderFinancialBreakdown` already
established, here applied to localization: Persian and English are edited,
reviewed, and published on completely independent timelines, never gated on
each other. `Category`/`Tag` are flat (no nesting) and locale-neutral
shells with their own `*Locale` tables carrying the actual name/slug — the
same author-vs-authorship split as `Article`/`ArticleLocale`. `MediaAsset`
is CMS-only, in a completely separate storage key namespace
(`cms/media/...`) from any pet/health document, deliberately never shared
with `PetsService`'s own upload path. The optional `ContentPlacement`/
`ContentBlock`/`ContentBlockLocale` trio (see "Landing/Home content hooks"
below) has **no layout, style, or CSS field of any kind** — content-only
fields (heading/body/CTA/media/an optional linked article) — so it cannot
structurally become an arbitrary no-code page builder, per the spec's
explicit warning against over-generalizing.

### Article lifecycle — four explicit states, five allowed transitions

`ArticleLifecycleStatus` is `DRAFT → VISIBLE → HIDDEN → ARCHIVED`, enforced
by a single `ALLOWED_TRANSITIONS` table in `AdminArticleService` — exactly
the five transitions the spec enumerates (`DRAFT→VISIBLE`, `VISIBLE→HIDDEN`,
`HIDDEN→VISIBLE`, `DRAFT→ARCHIVED`, `HIDDEN→ARCHIVED`) and nothing else;
`ARCHIVED` is a deliberate terminal state this phase — there is no
`ARCHIVED→*` transition at all, so archived content can never silently
reappear publicly without a brand-new locale save. `publishedAt` is set once,
the first time a locale reaches `VISIBLE`, and is never cleared by a later
`HIDDEN`/`ARCHIVED` transition, so the public article page can always show
both "published" and "updated" times honestly. **Editing and publishing are
always separate actions and separate endpoints** (`PUT .../locales/:locale`
never changes `status`; `POST .../publish|hide|archive` never touches
content) — the spec's explicit "be opinionated about reducing accidental
publication," proven by a dedicated e2e assertion that publishing never
fires from the same call as a content save.

### Localization — fa-IR first, published independently

Every `ArticleLocale`/`CategoryLocale`/`TagLocale` row carries its own
title/slug/excerpt/body/SEO fields and its own publication readiness — a
Persian article can go `VISIBLE` while its English counterpart doesn't exist
yet at all (Flow E/F in the e2e suite), and adding English later never
touches the Persian row's own status or history. Slugs are explicit,
admin-supplied, and validated with a shared `SLUG_PATTERN` regex
(`@Matches` on the DTO — never silently regenerated from the title at read
time), unique per `(locale, slug)` so `/fa/blog/x` and `/en/blog/x` can
never collide with each other's namespace, and a duplicate slug within the
same locale is rejected with `DUPLICATE_ARTICLE_SLUG`/`DUPLICATE_CATEGORY_SLUG`/
`DUPLICATE_TAG_SLUG` rather than silently overwriting. The pre-existing
`Locale` enum (`fa`/`en`) is reused directly for every CMS locale-row FK —
no new locale representation was invented to express "fa-IR"/"en."

### Editor format — a closed rich-text vocabulary instead of raw HTML

`RichTextDocument` (`@petlife/types`) is a **closed discriminated union** —
`RichTextBlock` (`paragraph`/`heading`/`list`/`quote`/`callout`/`image`) and
`RichTextInline` (a plain text run with `bold`/`italic`/`code` marks, or a
`link`) — stored as Postgres `Json` on `ArticleLocale.body`. Sanitization is
structural, not library-based: `validateRichTextDocument()`
(`modules/content/rich-text.util.ts`) walks every block/inline node and
**rejects** (never silently strips) anything outside the closed vocabulary,
including an unsafe link `href` (`isSafeHref()` — only a same-origin
relative path or an `http(s)://` URL; `javascript:`/`data:`/anything else is
a hard `400 INVALID_RICH_TEXT_CONTENT`, proven by a dedicated e2e test).
Because there is no `dangerouslySetInnerHTML` anywhere in
`RichTextRenderer.tsx`, there is no HTML-injection surface for a sanitizer
library to catch after the fact in the first place. An image block stores
only a `mediaAssetId` — never a URL — and a read-time-only
`resolveRichTextMedia()` helper (`content-mapper.ts`) resolves
`mediaAssetId → url` fresh on every read response, so the stored body never
denormalizes storage details and a disabled/replaced asset's URL is never
baked into old content. `RichTextRenderer` is the **one** renderer used
identically by the admin preview and the public article page — real
semantic elements throughout (`h2`–`h4`, `ul`/`ol`/`li`, `blockquote`, a
`role="note"` callout, `figure`/`figcaption` for images), RTL/LTR-safe via
logical `ps-`/`pe-`/border-`s-` Tailwind utilities rather than
`left`/`right`, external links carrying `target="_blank" rel="noopener
noreferrer"` while internal links use Next's own `Link`. `RichTextBlockEditor`
is a deliberately minimal, dependency-free block editor (per-block type
selector, plain-textarea single inline run, reorder/add/remove) — no WYSIWYG
and no inline bold/italic/link authoring UI this phase (see Known
limitations).

### Versioning + restore — append-only history, restore is a normal save

Every `saveLocale()` call — and the initial `create()` — snapshots
`{title, slug, excerpt, body, seoTitle, seoDescription}` into a new
`ContentVersion` row inside the exact same transaction as the write, with
`versionNumber` computed via a `SELECT ... FOR UPDATE` row-lock on the
`ArticleLocale` row (when one already exists) plus `count()+1` — race-safe
against two concurrent saves to the same article/locale without a separate
global sequence, since a version number only needs to order one article's
own history. `AdminContentVersionService.restore()` reads a target
version's own snapshot and calls back into **the exact same
`AdminArticleService.saveLocale()` write path** every manual edit already
takes, with a system-supplied change note ("Restored from version N") —
restore is therefore indistinguishable from a manual edit in the history it
leaves behind, and always produces a **new**, higher version number; no
code path ever mutates or rewinds an existing `ContentVersion` row in place
(proven by Flow L: the restored-from version's own row is read back
byte-for-byte unchanged after the restore).

### Preview — the existing authenticated admin endpoint, not new infrastructure

"Preview" is literally `GET /admin/content/articles/:id/locales/:locale` —
the same endpoint an editor already uses to load an article for editing.
It satisfies every literal spec requirement without a separate
preview-token subsystem: it works for `DRAFT`/`HIDDEN` content (there is no
status filter on this route at all), requires `content.view` and a valid
admin session (`SessionAuthGuard` + `AdminAuthGuard`, `401` anonymously),
never appears on any public route, is locale-aware, and — because
`AdminContentArticleEditorView`'s preview toggle renders content through
the *same* `RichTextRenderer` component the public article page uses —
"preview shows the actual consumer renderer" is true by construction, not
by convention or a second renderer that could silently drift from the real
one.

### Media — a second, separate upload namespace and authorization boundary

`AdminMediaService` mirrors `PetsController`'s existing two-step signed-URL
pattern exactly (`POST .../media/upload-url` → client `PUT`s bytes directly
to storage → `POST .../media` confirms with the resulting key/URL plus
metadata) via `StorageService.createCmsMediaUploadTarget()`, which uses the
key namespace `cms/media/...` — completely separate from
`createPetPhotoUploadTarget`'s `pets/...` — per the spec's explicit
"strongly separate CMS media authorization from private pet documents."
Only `image/jpeg`/`image/png`/`image/webp` are accepted (`@IsIn` at the DTO
layer, defense-in-depth-checked again in the service), and a configurable
`CMS_MEDIA_MAX_SIZE_BYTES` (default 5 MiB) rejects oversized uploads with
`MEDIA_TOO_LARGE`. `MediaAsset` never hard-deletes — `disable()` is a soft
flag mirroring `Pet.deletedAt`'s own precedent, so an already-published
article's cover/body image keeps resolving even after the asset is
disabled, while `assertSelectable()` (called before attaching media to any
new article/author/placement) refuses to let a disabled asset be selected
again (`MEDIA_ASSET_DISABLED`, proven by Flow S). Width/height are supplied
by the confirming client (already decoded in-browser) rather than a new
native image-processing dependency — a deliberate, documented simplification
(see Known limitations).

### SEO — locale-aware, no fabricated defaults

Each `ArticleLocale` carries its own optional `seoTitle`/`seoDescription`;
when absent, the public API returns `null` rather than fabricating a
value — a future Blog page template decides its own safe fallback (falling
back to the article's own `title`/`excerpt`), never something invented by
this handoff. `PublicContentReadService` computes a stable
`canonicalPath` (`/${locale}/blog/${slug}`) on every article response so a
future sitemap/canonical-tag/structured-data layer has one authoritative
source, and `updatedAt` is always the real, DB-tracked timestamp — nothing
here stores a formatted date string.

### Public Blog — VISIBLE-only by construction, never leaking a draft

`PublicContentReadService`/`PublicBlogController` (`ContentModule`, no
`AdminModule` import at all — the two CMS halves share only pure mapper/
validation utilities, never a service) expose
`GET /blog/articles`, `GET /blog/articles/:slug`, `GET /blog/categories`,
`GET /blog/categories/:slug`, `GET /blog/tags`, `GET /blog/tags/:slug` with
no auth guard at all — a deliberately public, anonymous-readable surface
like `/shop/products`. Every query filters on `status: VISIBLE` **at the
database level** — there is no separate "is this safe to show" check
layered on afterward, so a `DRAFT`/`HIDDEN`/`ARCHIVED` locale can never leak
through this service by omission (Flows B, I, J, N). A requested article
that exists but isn't `VISIBLE` in the requested locale throws the exact
same `ArticleLocaleNotFoundException` (404) as one that never existed at
all — mirroring `SupportCase`'s own "404 for both not-found and not-yours"
precedent — so an anonymous caller can never distinguish "never existed"
from "exists but is a draft." The public frontend
(`apps/web/app/[locale]/(public)/blog/{page,[slug],category/[slug],tag/[slug]}`)
renders a paginated index with category navigation and a "Load more" append
(never a replace, mirroring `SellerTransactionsView`'s own pagination
pattern), a full article page (title/excerpt/cover/author/published+updated
time/rendered body/category/tags), and category/tag-filtered variants that
resolve the category/tag's own localized name for the page header —
deliberately **no** "related articles"/AI-recommendation section this
phase, per the spec's explicit scope line.

### Admin CMS — one workspace, publishing kept a deliberate second step

A new "Content" section in the admin shell (Articles/Media/Placements nav
entries, gated on `content.view`) reaches: an article list (search, status
filter, locale filter, locale-status badges per row); an article editor
handling both create and edit (locale tabs loading/saving Persian and
English independently, shared fields — category/author/tags — edited
separately from locale content, a Save-draft button and separate Publish/
Hide/Archive buttons each disabled per the current status's own allowed
transitions, and a Preview toggle rendering through the real
`RichTextRenderer`); a version-history page per (article, locale) with a
Restore action; flat Categories/Tags management screens (both locales
entered on one screen, since neither ever blocks on the other); a Media
library (upload, inline alt-text editing, disable); and a Placements editor
(see below). Persian content renders natively in RTL throughout — no
mirrored/flipped Latin-first layout bolted on for `fa`.

### Landing/Home content hooks — typed placements, content only, no layout control

Four fixed `ContentPlacementKey` values (`LANDING_HERO`,
`LANDING_FEATURED_CONTENT`, `HOME_EDUCATION`, `HOME_ANNOUNCEMENT`) each hold
an ordered list of `ContentBlock`s with per-locale heading/body/CTA text —
structurally incapable of carrying layout/CSS/style, per the spec's "CMS
controls content, not visual architecture." `PublicContentPlacementReadService`
resolves a block's optional `linkedArticleId` through the exact same
VISIBLE-only public read path everything else in this handoff uses,
resolving to `null` rather than leaking a draft article's existence if the
linked article isn't publicly visible in the requested locale. **Nothing in
Codex's existing Landing visual implementation reads this table yet** — it
exists purely as a safe, typed content interface a future Landing/Home
change *could* consume; this handoff does not redesign, wire into, or touch
Codex's Landing rendering at all (see "Codex parallel work" below).

### RBAC — a new EDITOR role, publishing kept narrower than drafting

Six new permissions (`content.view`/`content.create`/`content.edit`/
`content.publish`/`content.archive`/`content.media.manage`) extend the
existing static `admin-permissions.ts` map. **`AdminRole.CONTENT`** already
existed (Handoff 11) for trust-and-safety content *moderation* — a
completely different concern from CMS editorial work — so this handoff adds
a distinct **`AdminRole.EDITOR`** rather than repurposing or renaming that
role (documented directly in a `schema.prisma` comment above `AdminRole` to
prevent future confusion). `EDITOR` receives the broad drafting set
(`content.view`/`content.create`/`content.edit`/`content.media.manage`) but
**not** `content.publish`/`content.archive` — only `ADMIN`/`SUPER_ADMIN` can
actually make a locale `VISIBLE` or `ARCHIVED` — the same "broad drafting,
narrow execution" shape `finance.refund.request` (broad) vs.
`finance.refund.execute` (`FINANCE`-only) already established in Handoff
11/14. Per the spec's explicit "do not grant publishing rights to SUPPORT by
default," `AdminRole.SUPPORT` receives **none** of the six `content.*`
permissions at all (proven by Flow H/G). Every route in
`AdminContentController` carries the one specific permission it performs,
never a single coarse "content" gate.

### Audit

Fifteen new `AdminAuditAction` values (`article.created/updated/published/
hidden/archived/restored`, `category.created/updated`, `tag.created/updated`,
`content_author.created/updated`, `media_asset.uploaded/disabled`,
`content_placement.updated`) extend Handoff 11's existing append-only
`AdminAuditLogService` — every CMS mutation goes through the exact same
`auditLog.record()` call every other admin-mutating service already uses
(proven by Flow T for placements). Per the spec's "do not log full
sensitive content unnecessarily if snapshots already exist in version
storage," article audit entries carry only coarse identifying fields
(locale, slug, title, version number) — the full editorial content already
has its own recoverable home in `ContentVersion`, so the audit log is never
asked to duplicate it.

### Security

Every admin CMS write sits behind `SessionAuthGuard` + `AdminAuthGuard` plus
a specific `content.*` permission; the public Blog surface has no session
concept at all and is safe to be fully anonymous precisely because every
query is `VISIBLE`-scoped at the database level (see "Public Blog" above).
Rich text is sanitized structurally (see "Editor format" above) rather than
via a runtime HTML sanitizer, closing the injection surface by construction
rather than by pattern-matching known-bad input. Media upload validates
MIME type and file size server-side (never trusting a client-supplied
`Content-Type` alone) and CMS media authorization is a fully separate key
namespace and service from any pet/health document upload path. No admin
CMS resource is ever addressed in a way that lets one admin's request leak
another entity's private state — every article/category/tag/media/version/
placement lookup is a plain `findUnique` by its own primary key with a
`404` on a miss, the same IDOR-safe pattern every prior admin domain
service already established.

### Codex parallel work

Per the spec's explicit instruction, this handoff did **not** touch, fix,
or expand into any of Codex's concurrently-owned territory: runtime repair,
Docker, DB availability, dependency installation, auth debugging, branch
integration, route QA, or visual QA/regression cleanup. No unrelated
pre-existing runtime issue blocked this handoff's implementation or
verification — Postgres/Redis needed a routine `sudo service ... start`
mid-session (the same sandbox-restart upkeep every prior handoff in this
session has needed), which is not a Codex-owned defect, just local
dev-environment bookkeeping. **Codex's own Landing visual implementation
was never modified, redesigned, or wired into** — the `ContentPlacement`
read API exists as a safe interface Landing/Home *could* adopt in a future,
separate change; nothing in this handoff makes that adoption happen. The
one pre-existing issue observed during final verification — a single
timeout in the large `app.e2e-spec.ts` file's Handoff 03 "returns only
VERIFIED providers by default" test — reproduced as a flake (it passed
cleanly on an isolated re-run) and touches code this handoff never modified;
it is not addressed here per "document, don't silently broaden scope," and
is called out again in Known limitations below.

### API endpoints (Handoff 15 additions)

```
GET    /blog/articles                                          (public; locale required; optional categorySlug/tagSlug/search; paginated)
GET    /blog/articles/:slug                                    (public; locale required; VISIBLE-only, 404 otherwise)
GET    /blog/categories                                        (public; locale required)
GET    /blog/categories/:slug                                  (public; locale required)
GET    /blog/tags                                               (public; locale required)
GET    /blog/tags/:slug                                         (public; locale required)
GET    /content/placements/:key                                 (public; locale required; typed Landing/Home content hook)

GET    /admin/content/articles                                  (content.view; search/status/locale/category/author filters, paginated)
GET    /admin/content/articles/:id                               (content.view)
POST   /admin/content/articles                                  (content.create; creates the Article shell + first locale + version 1)
PATCH  /admin/content/articles/:id                               (content.edit; shared fields only — author/category/cover/tags)
GET    /admin/content/articles/:id/locales/:locale               (content.view — also the preview endpoint)
PUT    /admin/content/articles/:id/locales/:locale               (content.edit; creates a new ContentVersion; never changes status)
POST   /admin/content/articles/:id/locales/:locale/publish       (content.publish)
POST   /admin/content/articles/:id/locales/:locale/hide          (content.publish)
POST   /admin/content/articles/:id/locales/:locale/archive       (content.archive)

GET    /admin/content/articles/:id/locales/:locale/versions      (content.view)
GET    /admin/content/content-versions/:versionId                (content.view)
POST   /admin/content/content-versions/:versionId/restore        (content.edit; creates a NEW version, never mutates history)

GET    /admin/content/categories                                 (content.view)
POST   /admin/content/categories                                 (content.create)
PATCH  /admin/content/categories/:id                              (content.edit)

GET    /admin/content/tags                                       (content.view)
POST   /admin/content/tags                                       (content.create)
PATCH  /admin/content/tags/:id                                    (content.edit)

GET    /admin/content/authors                                    (content.view)
POST   /admin/content/authors                                    (content.create)
PATCH  /admin/content/authors/:id                                 (content.edit)

POST   /admin/content/media/upload-url                           (content.media.manage)
POST   /admin/content/media                                       (content.media.manage; confirms an upload)
GET    /admin/content/media                                       (content.view; paginated)
GET    /admin/content/media/:id                                   (content.view)
PATCH  /admin/content/media/:id                                   (content.media.manage; alt text/dimensions)
POST   /admin/content/media/:id/disable                           (content.media.manage; soft-disable only)

GET    /admin/content/placements                                  (content.view; all four placement keys)
GET    /admin/content/placements/:key                             (content.view)
PUT    /admin/content/placements/:key                             (content.edit; replaces the block list wholesale)
```

### Error codes (Handoff 15 additions)

```
ARTICLE_NOT_FOUND                        404
ARTICLE_LOCALE_NOT_FOUND                 404  also returned for a locale that exists but isn't VISIBLE, on every public read
INVALID_ARTICLE_LIFECYCLE_TRANSITION     409  outside the five allowed transitions (DRAFT/VISIBLE/HIDDEN/ARCHIVED)
DUPLICATE_ARTICLE_SLUG                   409  same (locale, slug) already used by another article
DUPLICATE_CATEGORY_SLUG                  409
DUPLICATE_TAG_SLUG                       409
CATEGORY_NOT_FOUND                       404
TAG_NOT_FOUND                            404
CONTENT_AUTHOR_NOT_FOUND                 404
MEDIA_ASSET_NOT_FOUND                    404
MEDIA_ASSET_DISABLED                     409  a disabled asset can no longer be selected for new content
UNSUPPORTED_MEDIA_TYPE                   400  only image/jpeg, image/png, image/webp are accepted
MEDIA_TOO_LARGE                          400  exceeds CMS_MEDIA_MAX_SIZE_BYTES (default 5 MiB)
CONTENT_VERSION_NOT_FOUND                404
INVALID_RICH_TEXT_CONTENT                400  a block/mark/link outside the closed RichTextDocument vocabulary, or an unsafe href
CONTENT_PLACEMENT_NOT_FOUND              404
```

## Subscription + Membership + Metering (Handoff 16)

### Three separate states, never conflated

Subscription state (the household's plan/lifecycle), payment state (H07's own `PaymentIntent`/`Transaction`/`Refund`), and entitlement state (what the household can actually do right now) are three different concerns, resolved by three different services (`SubscriptionService`, `SubscriptionBillingService`, `EntitlementService`). A `Subscription` is never modeled as "payment succeeded" — it has its own explicit state machine (`SubscriptionStatus`: `TRIALING`/`ACTIVE`/`PAST_DUE`/`GRACE_PERIOD`/`CANCEL_AT_PERIOD_END`/`CANCELLED`/`EXPIRED`) with an explicit `ALLOWED_TRANSITIONS` table, the same shape Handoff 15's `ArticleLifecycleStatus` already established. `PAST_DUE` and `GRACE_PERIOD` are deliberately two distinct steps (first renewal failure — short retry window, full access — vs. retry window elapsed — final warning window, full access still) rather than one combined "past due" state, so the UI can escalate urgency honestly without ever revoking access early.

### One row per household, evolving over its whole lifecycle

`Subscription.householdId` is `@unique` — a household gets exactly one Subscription row, ever, and it evolves through FREE → trial → paid → cancelled → resubscribed rather than being recreated each time (the same "one row that evolves, history captured separately" shape `SellerLedgerAccount` established in Handoff 14). History lives in `SubscriptionPeriod` (billing periods), `SubscriptionBillingAttempt` (every charge attempt, succeeded or failed, never overwritten), and `SubscriptionChange` (an append-only narrative of trial starts, upgrades, downgrades, cancellations, admin actions — distinct from `AdminAuditLog`, which only covers admin-initiated mutations). Every household gets a real row lazily on first touch, defaulted to a real FREE plan — never an ad hoc "no subscription" fallback.

### The FREE plan is real, and self-healing

Every household resolves entitlements against an actual `SubscriptionPlan` row with `isFree: true`, never special-cased plan-name logic. Because that FREE plan is a hard dependency of the *entire app* (creating a pet, and every other subscription-scoped read, resolves it), `SubscriptionPlanReadService.getFreePlanRaw()` self-heals: if no FREE plan exists yet (a fresh checkout, or the isolated e2e test database, which CI populates via `prisma migrate deploy` only — never `prisma db seed`), it race-safely creates one with conservative defaults, using the same code (`DEFAULT_FREE_PLAN_CODE = "free"`) the deterministic dev seed catalog uses — running the seed afterward upgrades that same row in place rather than creating a duplicate. This was found and fixed mid-handoff: an early version threw a hard 500 on pet creation in any environment without seed data, which would have broken the entire e2e suite for every prior handoff.

### Entitlements — the actual architecture, not a plan-name check

No feature anywhere checks `if plan.code === "premium"`. `EntitlementService` is the one place any code asks "can this household do X" (`has()`, `getLimit()`, `getUsageItem()`, `assertWithinLimit()`), resolving in this order: an active `SubscriptionEntitlementOverride` for the key wins outright; otherwise the household's *effective* plan (its own current plan while `PAID_ACCESS_STATUSES` holds — `TRIALING`/`ACTIVE`/`PAST_DUE`/`GRACE_PERIOD`/`CANCEL_AT_PERIOD_END` — falling back to the FREE plan only once truly `CANCELLED`/`EXPIRED`) supplies it; a key neither defines resolves to the safest default (`false`/`0`), never `undefined` or unlimited-by-omission. `SubscriptionEntitlementType` supports `BOOLEAN` and `LIMIT` only — `QUOTA` was deliberately not added, since nothing in this handoff's real scope needs a reset-on-a-schedule quota.

### Metering is derived, not counted

`UsageService` meters exactly two keys this phase — `pets.max` (counts non-deleted `Pet` rows) and `household.members.max` (counts `HouseholdMember` rows) — both computed live from the source-of-truth tables, never a separately maintained counter. There is deliberately no `SubscriptionUsageCounter`/`SubscriptionUsageEvent` table: every metered resource here is durable and low-volume enough that deriving it can never drift from reality the way a separately incremented counter could. `household.members.max` resolves correctly through the entitlement system but currently has no enforcement call site — this codebase has no invite/add-member endpoint yet (`HouseholdsController` only supports creation), so there is nothing to gate; documented below rather than inventing a member-invite feature out of scope.

### Server-side limit enforcement — over-limit data is never touched

`PetsService.create()` calls `EntitlementService.assertWithinLimit(householdId, "pets.max")` before creating a row, returning a typed `SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED` (409) with `{ key, limit, used }` in `details` — never a generic failure. Frontend gating (disabling a button, showing "N of M used") is UX only; the actual check lives entirely server-side. Critically, a downgrade or grace/expiry fallback never deletes or hides existing data: a household with 5 pets that falls back to a 2-pet FREE limit keeps all 5 pets fully readable — the limit blocks only the *next* creation attempt.

### Reusing the H07 payment stack — a minimal internal shell, not a second payment system

`PaymentIntent.checkoutId` is a required FK to the real commerce `Checkout` model, which itself requires a `Cart` — both physical-goods-shaped and deeply relied on by `CheckoutService`/`OrdersService`/`InventoryReservationService`. Rather than loosening that schema (invasive, risky for existing commerce flows) or building a parallel payment stack (explicitly against spec), `SubscriptionBillingService` creates a minimal internal Checkout/Cart shell purely to satisfy the FK: the shell Cart's `status` is `CONVERTED` from creation (never `ACTIVE`, so `CartService.getCart()`'s own `status: ACTIVE` filter can never mistake it for a real shopping cart), it is never routed through `CheckoutService` at all, and only the synchronous `PaymentsService.charge()` path is used — never `resolvePendingIntent()` — so the existing `PaymentEventsListener` (which only reacts when `viaWebhook: true`) never touches it. `NotificationEventsListener`'s generic "payment succeeded" handler was taught to skip a checkout whose cart has zero line items, so a subscriber never gets a confusing "see My Orders" notification alongside the correct subscription one — a small, deliberate touch to shared H07/H10 code, not new infrastructure. Revenue posts through two new `LedgerService` methods (`recordSubscriptionRevenue`/`...Reversal`) mirroring `recordSellerAttribution`'s own shape — 100% platform revenue, no seller leg.

### Trial, purchase, upgrade — no fake payment success, no proration

A trial (`startTrial`) is a pure entitlement grant — no payment involved at all, gated only by `SubscriptionTrial`'s own `@@unique(householdId, planId)` (the actual anti-abuse enforcement; a friendlier pre-check just gives a nicer error than a raw constraint violation). An initial purchase or upgrade (`SubscriptionBillingService.purchase()`) charges the full price immediately and activates the plan/period at once. **H16's chosen proration policy is none**: an upgrade charges the new plan's full price and starts a brand-new period from now, with no partial credit for the unused portion of the old period — the simpler of the two policies the spec allows, chosen because it needs no floating-point/rounding logic and stays trivially auditable. Idempotency is layered two ways: the existing Redis-backed `IdempotencyInterceptor` at the HTTP layer, and a DB-level unique `SubscriptionBillingAttempt.idempotencyKey` inside the same transaction — a duplicate call (same idempotency key) converges on the exact same attempt row, never a duplicate charge or period.

### Downgrade — scheduled for the boundary, billed at the new price

`scheduleDowngrade()` only sets `Subscription.pendingPlanId`/`pendingPriceId` — it never reduces entitlements mid-period. The pending plan actually takes effect inside `SubscriptionBillingService.attemptRenewal()`, at the real period boundary, and — this needed a correction mid-build — the target plan/price is resolved and applied *before* the renewal charge is made, so the household is billed the new (lower) plan's price starting at the very renewal it takes effect, never the outgoing plan's price. Downgrading to the FREE plan skips charging entirely (`attempt: null` in the outcome) — no billing attempt row is ever created for a charge that was never going to happen.

### Renewal — an honest DEV adapter, not simulated production autopay

There is no real recurring-charge integration available through this project's existing payment providers, and the spec is explicit that simulating one would be dishonest. `SubscriptionRenewalWorkerService` is a plain polling `setInterval` (the exact shape `NotificationDeliveryWorkerService` already established, disabled under `NODE_ENV=test`) that drives `SubscriptionBillingService.attemptRenewal()` using the same `DEV_SIMULATED`/synchronous-charge path every other H16 charge uses — this *is* the honest DEV/manual adapter the spec asks for, not a claim of real autopay. It attempts a renewal once a period's `endAt` has actually passed, not proactively N days ahead — a deliberate simplification given a poller that already runs frequently (see Known limitations). A failed renewal moves `ACTIVE` → `PAST_DUE` (short configurable retry window, `SUBSCRIPTION_PAST_DUE_RETRY_DAYS`) → `GRACE_PERIOD` (final configurable warning window, `SUBSCRIPTION_GRACE_PERIOD_DAYS`) → `EXPIRED` (falls back to FREE entitlements) — full paid access is retained through every step except the last.

### Cancellation — cancel-at-period-end by default, no dark patterns

`cancelAtPeriodEnd()` is the only consumer-facing cancel path: the subscription moves to `CANCEL_AT_PERIOD_END` immediately but keeps full paid access until `cancelEffectiveAt` (snapshotted from the current period's own end, or the trial/grace end if there is no period), with `resumeCancellation()` available any time before that date. There is no immediate-cancel option — H16's scope never asks for one, and offering one would risk exactly the "dark pattern" the spec warns against.

### Refunds — a genuinely separate action from subscription status

`SubscriptionBillingService.refundBillingAttempt()` posts a real `Refund` row (reusing H07's model directly) and reverses the ledger postings, but never mutates `Subscription.status` itself — the spec is explicit that a subscription's lifecycle must never be inferred from an arbitrary refund. If an admin also wants to cancel or downgrade access after a refund, that's a separate, explicit action through `SubscriptionService`.

### Concurrency — lock, then re-read, then decide; found and fixed mid-build

Every subscription-mutating transaction (`purchase`, `startTrial`, `scheduleDowngrade`, `cancelAtPeriodEnd`, `resumeCancellation`, `attemptRenewal`) row-locks the `Subscription` (`SELECT ... FOR UPDATE`) before validating or mutating anything — the same pattern `DisputeService.transition`/`SupportCaseService.transition` already established. This needed a real fix during the build: an earlier version of `purchase()` read the subscription row via `getOrCreateRaw()` *before* acquiring the lock and never re-read it afterward, so a racing transaction's already-committed changes could be invisible even after the lock was held — exactly the class of bug the spec's own "test concurrent subscription creation/renewal/upgrade/cancel" requirement exists to catch. `SubscriptionService.lockAndGetCurrent()` (get-or-create, lock by id, then a fresh re-read) is now the one path every mutation uses. `refundBillingAttempt()` got the same fix for a narrower double-refund race. The dedicated e2e suite (below) includes concurrent-purchase and concurrent-cancel tests that exercise these locks directly.

### Admin surface

`admin/subscriptions/` (parallel to `admin/finance/`) provides plan/price CRUD (`AdminSubscriptionPlanService` — historical subscriptions never break when a plan is later hidden, since `SubscriptionPlanStatus.HIDDEN`/`INACTIVE` only gates *new* subscribability), household subscription search/detail with billing attempts, admin cancel (recorded as `SubscriptionChangeType.ADMIN_CANCELLED`, same cancel-at-period-end semantics as the consumer path — never an immediate-revoke code path this handoff doesn't ask for), and manual entitlement overrides (`SubscriptionEntitlementOverride{household, key, value, reason, createdByAdmin, expiresAt, active}` — granting one first deactivates any existing active override for that key, so resolution never has two active rows to arbitrate between). RBAC reuses H11's Admin RBAC: `subscription.view` (read-only, held by `SUPPORT`/`FINANCE`/`OPERATIONS`), `subscription.manage` and `subscription.plan.manage` (ADMIN and above), and `subscription.entitlement.override` — deliberately **SUPER_ADMIN-only**, not even delegated to `ADMIN`, mirroring `admin.manage`'s own "never delegated" precedent given how high-risk a manual entitlement bypass is.

### Notifications + support integration

`SubscriptionNotificationListener` fans out across all 10 subscription domain events to *every* current `HouseholdMember` (a subscription belongs to the household, not one user) — safe because `Notification`'s own `@@unique([domainEventId, type, userId])` constraint means a retried event still converges to exactly one notification per member. Each member gets the plan name in their own locale rather than one hardcoded language. `subscription.trial_ending`/`subscription.renewal_upcoming` (both named as "potential" in the spec) are deliberately not implemented: the renewal worker only ever acts once a period has already ended, never proactively N days ahead, so there is no point in time to fire either notification without adding new proactive-scheduling infrastructure this handoff's renewal design doesn't have. `SupportCaseContextDto` gained a `subscription: SupportSubscriptionSummaryDto` field (plan/status/period end/most recent *failed* billing attempt only — never a succeeded attempt's payment detail) so H13's support context panel shows subscription state directly.

### Consumer + admin frontend

Consumer: `/subscription` (plan/status/period/trial/cancellation state, entitlements + usage, cancel/resume) and `/subscription/plans` (every ACTIVE plan for the household's country in one comparison list — FREE is never hidden or demoted), reachable from a new Home entry point; every mutation error surfaces the backend's own specific message inline (`ApiError.message`), never a generic "something went wrong". Admin: a new Subscriptions nav item (behind `subscription.view`) leading to Plans/Prices management, a filterable Household Subscriptions list, and a household detail page with billing attempts + refund + entitlement override grant/revoke + cancel — all following this codebase's existing plain-list-and-detail admin UI shape (no new table/pagination component was introduced; every other admin list view already uses a single generously-sized page rather than paged controls, and this handoff matches that).

### Seed data

`seed.ts` gained a `seedSubscriptions()` step (idempotent, upsert-based — unlike most of this file's create-only fixtures) producing three deterministic plans: **Free** (`pets.max: 2`, `household.members.max: 3`), **Plus** (`pets.max: 5`, `household.members.max: 6`, 14-day trial, obviously-fake dev prices ۹۹۰,۰۰۰ / ۹,۹۰۰,۰۰۰ IRR monthly/annual), and **Premium** (unlimited pets/members, 14-day trial, ۱,۹۹۰,۰۰۰ / ۱۹,۹۰۰,۰۰۰ IRR). The Free plan reuses the exact code the runtime self-healing fallback creates, so seeding after that fallback has already run upgrades the same row rather than duplicating it.

### Codex parallel work

Per this handoff's own instructions, local runtime/browser QA, route navigation, and general regression cleanup were left to Codex's parallel work rather than duplicated here. One cross-cutting fix was made because H16 genuinely depended on it: `NotificationEventsListener`'s payment-succeeded/failed handlers (see above) — a pre-existing gap that would have produced confusing notifications for every subscription payment, not something introduced by this handoff.

### API endpoints (Handoff 16 additions)

```
GET    /households/:householdId/subscription
GET    /households/:householdId/subscription/plans
GET    /households/:householdId/subscription/entitlements
GET    /households/:householdId/subscription/usage
GET    /households/:householdId/subscription/billing-history
GET    /households/:householdId/subscription/changes
POST   /households/:householdId/subscription/trial          (Idempotency-Key)
POST   /households/:householdId/subscription/subscribe      (Idempotency-Key)
POST   /households/:householdId/subscription/upgrade        (Idempotency-Key)
POST   /households/:householdId/subscription/downgrade
POST   /households/:householdId/subscription/cancel
POST   /households/:householdId/subscription/resume

GET    /admin/subscriptions/plans
GET    /admin/subscriptions/plans/:planId
POST   /admin/subscriptions/plans                                    subscription.plan.manage
PATCH  /admin/subscriptions/plans/:planId                             subscription.plan.manage
POST   /admin/subscriptions/plans/:planId/entitlements                subscription.plan.manage
POST   /admin/subscriptions/plans/:planId/prices                      subscription.plan.manage
PATCH  /admin/subscriptions/prices/:priceId                           subscription.plan.manage

GET    /admin/subscriptions/households                                subscription.view
GET    /admin/subscriptions/households/:householdId                   subscription.view
POST   /admin/subscriptions/households/:householdId/cancel            subscription.manage

GET    /admin/subscriptions/billing-attempts                          subscription.view
POST   /admin/subscriptions/billing-attempts/:id/refund               subscription.manage

GET    /admin/subscriptions/households/:householdId/entitlement-overrides   subscription.view
POST   /admin/subscriptions/entitlement-overrides                     subscription.entitlement.override
DELETE /admin/subscriptions/entitlement-overrides/:id                 subscription.entitlement.override
```

### Error codes (Handoff 16 additions)

```
SUBSCRIPTION_NOT_FOUND                          404
SUBSCRIPTION_PLAN_NOT_FOUND                      404
SUBSCRIPTION_PLAN_PRICE_NOT_FOUND                404  no ACTIVE price for this plan/country/interval
DUPLICATE_SUBSCRIPTION_PLAN_CODE                 409
INVALID_SUBSCRIPTION_STATUS_TRANSITION           409
SUBSCRIPTION_PLAN_NOT_AVAILABLE                  400  plan not ACTIVE, or not available in this country
SUBSCRIPTION_TRIAL_NOT_ELIGIBLE                  409  reason: PLAN_HAS_NO_TRIAL | ALREADY_SUBSCRIBED | TRIAL_ALREADY_USED
SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED          409  details: { key, limit, used }
SUBSCRIPTION_BILLING_ATTEMPT_NOT_FOUND           404
SUBSCRIPTION_BILLING_ATTEMPT_NOT_REFUNDABLE      409  not SUCCEEDED, or already refunded
SUBSCRIPTION_ENTITLEMENT_OVERRIDE_NOT_FOUND      404
SUBSCRIPTION_ALREADY_CANCELLED                   409  cancel/resume attempted from an invalid state
```

## Advanced Health + Medical Documents + Clinical OS (Handoff 17)

### Two connected experiences, one longitudinal record

Health Basics (Handoff 02) stays exactly as it was — allergies, conditions, medications, vaccination summary, diet, care profile. This handoff adds a second layer on top: an Owner Health Experience (Overview, Timeline, Documents, Labs, Imaging, Referrals, Dental, Nutrition, Rehab, Observations, each its own route rather than one giant page) and a Provider Clinical OS (Patient Context → Visit → Clinical Documentation → Orders/Results/Referral → Care Plan → Follow-up). Both read and write against the same sixteen new Prisma models, so "what the owner sees" and "what the provider documented" are always the same underlying rows viewed through two different, permission-scoped DTOs — never two copies of the truth.

### Ten locked principles, enforced in code, not just in the spec prose

1. **Medical records are provenance-oriented** — every new model carries a `sourceType` (`SourceType.OWNER`/`HOUSEHOLD_MEMBER`/`PROVIDER`/`CLINIC`/`IMPORTED_DOCUMENT`/`SYSTEM`, extended additively from Handoff 02's own enum) plus a `ClinicalActorRefDto`-shaped source (provider org/user, or household user) resolved on every read.
2. **Provider-originated records are not silently overwritten by owners** — `provenance.util.ts`'s `assertOwnerEditable(sourceType)` throws `ProviderRecordNotOwnerEditableException` and is wired into the three pre-existing H02 services that needed it (`AllergiesService.update/remove`, `ConditionsService.update`, `MedicationsService.update`) — a small, targeted change to established code because the principle is central to this handoff, not a rewrite of Health Basics.
3. **Owner corrections preserve history** — `MedicalRecordCorrection` (`targetType`/`targetId`, a polymorphic pair modeled directly on `AdminAuditLog`'s own `entityType`/`entityId` precedent) is a *new* row alongside the original, never an edit to it; the UI renders both the provider original and the correction, never one replacing the other.
4. **Unknown ≠ Normal** — a lab result's `flag` (`LabResultFlag.ABNORMAL`/`NORMAL`) is `null` unless a provider explicitly set it; the frontend renders the raw `status` in that case, never a fabricated "Normal".
5. **Missing ≠ Healthy** — every list view (`HealthRecordListView`, `HealthDocumentsView`, `HealthObservationsView`) renders an explicit `EmptyState` ("No lab results recorded.") rather than defaulting to a reassuring blank page or a green checkmark.
6. **Medical data retains source** — `source`/`sourceType` are present on every DTO, not just the document model.
7. **Private medical documents are never publicly exposed** — see storage architecture below.
8. **Household/PetAccess/provider grant rules remain authoritative** — see authorization below; nothing new bypasses `PetAccessGuard`.
9. **AI extraction is out of scope** — no OCR, no summarization, no automated diagnosis anywhere in this handoff; `SourceType` has no `AI` value.
10. **No duplicated Jalali backend values** — every new timestamp column is a plain `TIMESTAMP(3)`; Jalali display continues to be computed client-side with `Intl.DateTimeFormat(..., { calendar: "persian" })`, the exact convention every prior handoff already established.

### Sixteen new models, one authorization boundary

`MedicalDocument`, `MedicalRecordCorrection`, `LabResult`, `ImagingStudy`, `Referral`, `DentalRecord`, `ClinicalNutritionPlan`, `RehabPlan`, `RehabSession`, `PetObservation`, `ClinicalVisit`, `ClinicalVisitRevision`, `CarePlan`, `CarePlanItem`, `SeniorCareNote`, `EndOfLifeCarePlan` — every one of them FKs to `Pet` with `onDelete: Restrict` (matching Health Basics' own FK policy, never `Cascade`), and every consumer-facing endpoint is guarded by `@UseGuards(SessionAuthGuard, PetAccessGuard)` with `@RequirePetAccess({ canViewHealth: true })` (or `canEditHealth`/`canRecordClinicalData` for a mutation), reusing Handoff 03's grant-union `PetAccessGuard` rather than inventing a second authorization path. Provider routes stack a second guard set — `@UseGuards(SessionAuthGuard, ProviderAuthGuard, PetAccessGuard)` — so a provider needs *both* a resolved org membership (`ProviderAuthGuard`, auto-resolved from the caller's single active `ProviderUser`, the same no-`:providerId`-in-the-URL convention `/provider/bookings` already established) *and* an explicit pet-level grant; org membership alone never grants pet access.

### `canRecordClinicalData` — the one new authorization flag, deliberately narrow

A provider can only author clinical content (visits, labs, imaging, referrals, care plans) for a pet if their `PetAccessGrant` has the new boolean `canRecordClinicalData`, which is set `true` in exactly one place: `BookingPetAccessService.grantForBooking()`, and only when `booking.category === ServiceCategory.VET`. Every household/family preset (`OWNER_PRESET`, `FAMILY_PRESET`, `NO_ACCESS_PRESET`) sets it `false` — an owner or household member can view and correct their pet's clinical record but never author one, matching the spec's "AI extraction and clinical authorship both stay out of the owner's hands" boundary. For nested provider mutations that don't carry `:petId` in the URL (a referral status PATCH, a lab amendment, an imaging void), the request DTO carries `petId` directly so `PetAccessGuard`'s existing body-fallback still applies, and the service layer independently re-checks the target row's actual `petId` (`clinical-link.util.ts`'s `assertVisitBelongsToPet`) as defense-in-depth against a spoofed value.

### Private medical documents — a real signed-download capability that didn't exist before

The audit at the start of this handoff found that the existing `StorageService` could mint upload URLs but had **no signed-download capability at all** — every existing file was served through a public object URL. Medical documents cannot use that. `StorageDriver` gained `createDownloadTarget(key)`: `S3StorageDriver` mints a real 5-minute presigned GET, and the local-dev `LocalStorageDriver` mints a one-time-ish Redis-backed download token resolved by a new `DownloadsController` (`GET /downloads/:token`, mirroring `UploadsController`'s exact shape). `StorageService.createHealthDocumentUploadTarget`/`createObservationMediaUploadTarget` validate a MIME allow-list and size cap (20MB for documents, 50MB for observation photo/video) *before* minting anything, generate a `randomUUID()` filename (the client-supplied name is never trusted or stored as a path segment), and write under private key prefixes (`health-documents/{petId}/...`, `pet-observations/{petId}/...`) deliberately distinct from the pre-existing public `pets/{petId}/...` photo scheme. `MedicalDocument.fileObjectKey` is the only thing ever stored — never a public URL — and every download goes through `GET /pets/:petId/health/documents/:id/download`, which re-checks `PetAccessGuard` and mints a fresh signed URL on every call rather than caching or returning one.

### Provider originals — append/supersede/void, never edit-in-place

Nothing a provider authors is ever mutated in place once created; each model uses the append-safe shape that fits it best. `LabResult` self-relates (`supersedesId`/`supersededBy`, a unique FK) — amending marks the old row `AMENDED` and creates a new row pointing back to it. `MedicalDocument` and `ImagingStudy` use `voidedAt`/`voidedReason` — voiding never deletes, it flags, and a replacement is a new row. `ClinicalVisit` uses a dedicated append-only `ClinicalVisitRevision` table, snapshotting the full prior content (`snapshotReasonForVisit`/`snapshotHistoryText`/`snapshotObservationsText`/`snapshotAssessmentText`/`snapshotPlanText`) with an incrementing `revisionNumber`, taken immediately before every amend or void.

### Clinical Visit — separate from Booking, on purpose

`ClinicalVisit` (`visitId`, nullable `bookingId`, `petId`, `providerOrganizationId`, `providerUserId`, `reasonForVisit`/`historyText`/`observationsText`/`assessmentText`/`planText`, `status`, `startedAt`/`completedAt`) is never collapsed into `Booking`: Booking stays the commercial/scheduling state machine from Handoff 03, ClinicalVisit is a wholly separate care-documentation state machine (`DRAFT`/`IN_PROGRESS`/`COMPLETED`/`AMENDED`/`VOIDED`). `start()` creates a visit directly at `IN_PROGRESS` (this phase's one-step "provider starts a visit" action; `DRAFT` stays in the vocabulary for a future multi-step-drafting phase but is unreachable via this API today). Notes are freely editable while `IN_PROGRESS`; once `COMPLETED`, `updateNotes()` is rejected outright and only `amend()` can change the content — and `amend()` always snapshots the prior state into `ClinicalVisitRevision` first, so nothing is ever silently edited after completion.

### A genuine lost-update race was found and fixed during this handoff's own build

The concurrency e2e (Flow P: two simultaneous `POST .../complete` calls on the same visit) initially failed with both requests returning `201` — `ClinicalVisitService.complete()` read the visit's status, validated it *outside* the transaction, then performed an unconditional `update()` inside it, so two racing requests could both pass validation and both "win". Fixed with the same claim-then-check `updateMany({ where: { id, status: { in: [...] } } })` / `count === 0 → throw` pattern this codebase already established in `ShippingOrchestratorService`, `NotificationDeliveryService.attempt()`, and `SellerLedgerService.sweepTransactions()` — one request's `updateMany` now genuinely claims the row, the loser's `count` comes back `0` and it gets a real `409`. `voidVisit()` had the identical class of race (nothing stopped two concurrent voids from both succeeding and both writing a revision) and was hardened the same way as a small, directly-related fix, not a scope expansion.

### Labs, imaging, referrals — structured, never interpreted

`LabResult` carries `value`/`unit`/`referenceRangeLow`/`referenceRangeHigh`/`qualitativeResult`/`status`/`flag` — `flag` is `null` unless a provider explicitly set `ABNORMAL`/`NORMAL`; nothing derives it from the numeric value against the reference range, per the spec's "do not invent medical interpretation" line. `ImagingStudy` carries a free-text `report`/`findings`/`recommendation` from the provider only — there is no image-analysis code path, and the frontend renders the report text as-is, never as a structured "diagnosis." `Referral` has its own state machine (`CREATED`/`SENT`/`ACCEPTED`/`SCHEDULED`/`COMPLETED`/`CANCELLED`) completely independent of `BookingStatus`; a referral to a provider that already exists in PET LIFE OS links via `toProviderOrganizationId`, otherwise `externalProviderName`/`externalSpecialty` carry the metadata.

### Home Observations — owner-recorded, never a diagnosis

`PetObservation` (`category`, `description`, `observedAt`, optional photo/video via the same private-storage pattern as documents) is explicitly owner-only — there is no provider-authored observation, and no observation is ever silently promoted into a `Condition` or any other clinical record. `HealthObservationsView` always renders a disclaimer ("Owner observation — not a diagnosis.") above the entry form, and the list never attaches a diagnosis-shaped field to a recorded entry. `health.observations.max` is entitlement-gated (see below) since this is the one owner-initiated creation path in the whole handoff besides documents.

### Care Plan — provider-issued, Care Calendar reused rather than duplicated

`CarePlan`/`CarePlanItem` (`MEDICATION`/`FOLLOW_UP`/`NUTRITION`/`REHAB`/`MONITORING`/`REFERRAL`/`VACCINATION`/`OTHER`, each with its own `status`/`dueAt`/`source`) is provider-issued only. A `FOLLOW_UP`-type item is deliberately *not* wired into a second reminder system — Handoff 03's Care Calendar already owns "things with a date the owner should see," so a follow-up is represented as a `CarePlanItem` the owner sees in their Health Overview, not a duplicate calendar event; a future handoff could project it into Care Calendar the same way a `Booking` already is, without any schema change here.

### Senior Care + End-of-Life — foundation only, no scoring, no automation

`SeniorCareNote` (mobility/cognition/medication-complexity/quality-of-life free text) and `EndOfLifeCarePlan` (palliative care plan, aftercare preferences) exist as plain structured records with no derived score and no automatic lifecycle trigger — a pet's lifecycle state is never changed as a side effect of creating or reading either model, and the tone of every string in this area (frontend copy, notification templates) is deliberately non-commercial and respectful, per the spec.

### Entitlement gating — asymmetric on purpose, never on safety-critical data

`health.documents.max`/`health.observations.max` were added to `UsageService.DERIVERS` (household-scoped, derived-not-counted counts, the exact "derived, never duplicated" shape `pets.max`/`household.members.max` already established in Handoff 16) and seeded onto all three plans (`seed.ts`: Free 10 documents/20 observations, Plus 50/100, Premium unlimited). `EntitlementService.assertWithinLimit()` is called **only** on the owner-initiated creation paths — `MedicalDocumentService.create()` when the actor is not a provider, and `PetObservationService.create()` always, since observations are owner-only. Every provider-authored creation (labs, imaging, referrals, visits, care plans, dental, nutrition, rehab) is **never** gated — the spec is explicit that safety-critical clinical authorship must never be paywalled, and existing records remain fully readable even past a limit or an expired entitlement; a limit only ever blocks the *next* owner upload, exactly like Handoff 16's own `pets.max` precedent. This was caught by the e2e suite itself: the two new keys were wired into `UsageService` but never actually added to any `SubscriptionPlanEntitlement` row, so the very first document upload in a fresh test household returned `409` — fixed by seeding the keys onto all three plans (see Errors/fixes below).

### Notifications — a stricter SMS bar than the existing precedent

Five new templates (`health.document_added`, `health.follow_up_due` — modeled but not yet wired, since nothing in this handoff proactively schedules follow-up reminders — `health.referral_created`, `health.referral_updated`, `health.care_plan_updated`) go through the existing `NotificationOrchestratorService` only. Every one of their `smsBody` strings is fully generic (no pet name, no document title, no finding, no diagnosis) — deliberately stricter than Handoff 02's own `health.reminder` template, which does interpolate `{{petName}}`, because the spec's "do not expose detailed diagnosis in SMS" line reads as calling for a more conservative bar specifically for clinical content.

### Support integration — a coarse summary, never the clinical record

`SupportCaseService.getHealthSummary(petId)` returns exactly three fields — `openMedicalDocumentsCount`, `recentClinicalVisit` (id/status/org name/start time only, no notes), `openReferralsCount` — wired into `getContext()` as `SupportCaseContextDto.health`. The e2e coverage (Flow M) asserts the JSON-stringified context does not contain a document's title or a lab's test name/value, not just that the shape looks right.

### Frontend — ten consumer routes, two provider views, no giant page

Consumer: `/pets/:id/health/advanced` (Overview) plus one route each for Timeline/Documents/Labs/Imaging/Referrals/Dental/Nutrition/Rehab/Observations — Labs/Imaging/Referrals/Dental/Nutrition/Rehab share one generic `HealthRecordListView<T>` shell (loading/error/empty/list, per-domain only in title/empty-copy/`renderItem`) rather than six near-identical components. `AdvancedHealthOverviewView` deliberately shows no numeric health score anywhere — per the spec, if one can't be responsibly calculated, none is shown — and lists `missingInformation` as explicit strings rather than a reassuring blank state. Provider: `ProviderClinicalPatientView` (Patient Header/Summary — allergies, medications, conditions, recent visits, recent labs, documents, care plans, respecting the same `PetAccessGuard` the API enforces) and `ProviderClinicalVisitView` (notes editable only pre-completion, an Amend/Void pair post-completion, a Revision History list rendered directly from `ClinicalVisitRevision` rows).

### Errors and fixes found during this handoff's own verification

- **A provenance display bug**: `HealthDocumentsView`'s provider-badge logic originally keyed off `verificationStatus === "PROVIDER_VERIFIED"` rather than `sourceType === PROVIDER || CLINIC` — today the two happen to coincide (verification status is set from the same `actor.provider` check at creation time), but they are two different concepts (verification vs. provenance) and would silently diverge the moment a "provider verifies an owner's document" action is ever added. Fixed to read `sourceType` directly, the same field `HealthTimelineView`'s own provenance badge already used correctly.
- **Missing entitlement seed data**: `health.documents.max`/`health.observations.max` were wired into `UsageService` but never added to any plan's `SubscriptionPlanEntitlement` rows, so `EntitlementService.getLimit()`'s own documented "a key neither plan defines resolves to 0" fallback made the very first owner document/observation upload fail with `409` in any fresh household. Fixed by seeding both keys onto Free/Plus/Premium in `seed.ts`.
- **A real concurrent-completion lost-update** in `ClinicalVisitService.complete()`/`voidVisit()` — see "A genuine lost-update race" above.
- Two pre-existing, unrelated migrations in the isolated test database (`petlife_os_test`) were found half-applied (`finished_at IS NULL`) from an earlier, unrelated session in this environment — `20260903063100_seller_financial_settlement` (Handoff 14) and three others through Handoff 16's own migration. Every object each migration creates was verified present in the database before resolving it with `prisma migrate resolve --applied`; this is pre-existing environment bookkeeping, not a Handoff 17 regression, and is called out here only because it blocked this handoff's own e2e run until resolved.

### API endpoints (Handoff 17 additions)

```
GET    /pets/:petId/health                                          (Health Overview — no numeric score)
GET    /pets/:petId/health/timeline                                 (derived, cross-domain, provenance-tagged)

GET    /pets/:petId/health/documents
POST   /pets/:petId/health/documents/upload-url
POST   /pets/:petId/health/documents
GET    /pets/:petId/health/documents/:documentId
GET    /pets/:petId/health/documents/:documentId/download            (fresh signed URL every call)
POST   /pets/:petId/health/documents/:documentId/void

GET    /pets/:petId/health/corrections
POST   /pets/:petId/health/corrections                               (never edits the original record)

GET    /pets/:petId/health/labs
GET    /pets/:petId/health/imaging
GET    /pets/:petId/health/referrals
GET    /pets/:petId/health/dental
GET    /pets/:petId/health/nutrition
GET    /pets/:petId/health/rehab

GET    /pets/:petId/health/visits
GET    /pets/:petId/health/visits/:visitId
GET    /pets/:petId/health/care-plans

GET    /pets/:petId/health/senior-care
POST   /pets/:petId/health/senior-care
GET    /pets/:petId/health/end-of-life
POST   /pets/:petId/health/end-of-life

GET    /pets/:petId/observations
POST   /pets/:petId/observations/media-upload-url
POST   /pets/:petId/observations                                     (owner-only; never a diagnosis)

GET    /provider/patients/:petId                                    (provider-scoped clinical DTO — never the consumer DTO)
GET    /provider/patients/:petId/visits
GET    /provider/patients/:petId/visits/:visitId
POST   /provider/visits                                              (canRecordClinicalData required)
POST   /provider/patients/:petId/visits/:visitId/notes
POST   /provider/patients/:petId/visits/:visitId/complete
POST   /provider/patients/:petId/visits/:visitId/amend               (always snapshots first)
POST   /provider/patients/:petId/visits/:visitId/void

POST   /provider/labs
POST   /provider/labs/:labResultId/amend                             (append/supersede — never edits the original row)
POST   /provider/imaging
POST   /provider/imaging/:imagingStudyId/void
POST   /provider/referrals
PATCH  /provider/referrals/:referralId/status
POST   /provider/dental-records
POST   /provider/nutrition-plans
POST   /provider/rehab-plans
POST   /provider/patients/:petId/rehab-plans/:rehabPlanId/sessions
POST   /provider/care-plans
POST   /provider/patients/:petId/care-plans/:carePlanId/items
PATCH  /provider/patients/:petId/care-plans/:carePlanId/items/:itemId/status
POST   /provider/patients/:petId/documents/upload-url
POST   /provider/patients/:petId/documents
```

### Error codes (Handoff 17 additions)

```
MEDICAL_DOCUMENT_NOT_FOUND                       404
UNSUPPORTED_DOCUMENT_TYPE                        400  MIME/type not on the allow-list
DOCUMENT_TOO_LARGE                               400  over the 20MB document / 50MB media cap
PROVIDER_RECORD_NOT_OWNER_EDITABLE                409  owner attempted to edit a PROVIDER/CLINIC-sourced record
MEDICAL_RECORD_CORRECTION_NOT_FOUND              404
CLINICAL_VISIT_NOT_FOUND                         404
INVALID_CLINICAL_VISIT_TRANSITION                409  status doesn't allow the requested action, or lost a completion/void race
LAB_RESULT_NOT_FOUND                             404
IMAGING_STUDY_NOT_FOUND                          404
REFERRAL_NOT_FOUND                               404
INVALID_REFERRAL_TRANSITION                      409
CARE_PLAN_NOT_FOUND                              404
CARE_PLAN_ITEM_NOT_FOUND                         404
CLINICAL_RECORDING_NOT_AUTHORIZED                403  provider grant lacks canRecordClinicalData
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

GET    /seller-organizations                     (session-scoped; the seller organizations the caller belongs to — no :sellerId, discovered before any :sellerId route is useful)
GET    /seller-context                           (memberships + active seller, for the seller switcher)
POST   /seller-context                           (set the active seller preference)

GET    /seller-organizations/:sellerId
PATCH  /seller-organizations/:sellerId           (ADMIN+)
GET    /seller-organizations/:sellerId/dashboard

GET    /seller-organizations/:sellerId/members
POST   /seller-organizations/:sellerId/members            (ADMIN+; invite)
PATCH  /seller-organizations/:sellerId/members/:membershipId    (ADMIN+; role change, blocked by the last-owner safeguard)
DELETE /seller-organizations/:sellerId/members/:membershipId    (ADMIN+; blocked by the last-owner safeguard)

GET    /seller-organizations/:sellerId/offers              (paginated)
GET    /seller-organizations/:sellerId/offers/:offerId
POST   /seller-organizations/:sellerId/offers               (CATALOG_MANAGER+)
PATCH  /seller-organizations/:sellerId/offers/:offerId       (CATALOG_MANAGER+)

GET    /seller-organizations/:sellerId/inventory                        (paginated)
PATCH  /seller-organizations/:sellerId/inventory/:inventoryItemId       (OPERATIONS/CATALOG_MANAGER+; mode: ABSOLUTE|DELTA)
GET    /seller-organizations/:sellerId/inventory/:inventoryItemId/history   (paginated InventoryMovement audit trail)

GET    /seller-organizations/:sellerId/orders                (paginated; unified PET LIFE OS + marketplace orders)
GET    /seller-organizations/:sellerId/orders/:orderId

GET    /seller-organizations/:sellerId/channels
GET    /seller-organizations/:sellerId/channels/:channelAccountId
POST   /seller-organizations/:sellerId/channels                          (ADMIN+; provider: DEV|TOROB|DIGIKALA)
PATCH  /seller-organizations/:sellerId/channels/:channelAccountId        (ADMIN+; sync-flag toggles)
POST   /seller-organizations/:sellerId/channels/:channelAccountId/reconcile   (CATALOG_MANAGER+; bounded to the first 50 listings)

GET    /seller-organizations/:sellerId/marketplace-listings              (paginated)
GET    /seller-organizations/:sellerId/marketplace-listings/:listingId
POST   /seller-organizations/:sellerId/marketplace-listings              (create a DRAFT listing mapping)
PATCH  /seller-organizations/:sellerId/marketplace-listings/:listingId
POST   /seller-organizations/:sellerId/marketplace-listings/:listingId/publish
POST   /seller-organizations/:sellerId/marketplace-listings/:listingId/sync    (re-pushes current inventory + price)
POST   /seller-organizations/:sellerId/marketplace-listings/:listingId/deactivate
POST   /seller-organizations/:sellerId/marketplace-listings/:listingId/reconcile

POST   /seller-organizations/:sellerId/channels/:channelAccountId/dev/simulate/order               (dev/test-only; hard-disabled outside development/test via NODE_ENV)
POST   /seller-organizations/:sellerId/channels/:channelAccountId/dev/simulate/cancellation         (dev/test-only)
POST   /seller-organizations/:sellerId/channels/:channelAccountId/dev/simulate/mismatch             (dev/test-only)
POST   /seller-organizations/:sellerId/channels/:channelAccountId/dev/simulate/publish-rejection    (dev/test-only)

GET    /notifications                            (paginated; scoped to the caller's own userId)
GET    /notifications/unread-count
PATCH  /notifications/:id/read
POST   /notifications/read-all
GET    /notification-preferences
PATCH  /notification-preferences
POST   /dev/notifications/simulate                          (dev/test-only; hard-disabled outside development/test via NODE_ENV)
POST   /dev/notifications/deliveries/:deliveryId/force-attempt  (dev/test-only)
POST   /dev/notifications/deliveries/process-due             (dev/test-only)

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

Everything in the Handoff 09 acceptance criteria: a real `SellerMembership`
authorization model (`OWNER`/`ADMIN`/`OPERATIONS`/`CATALOG_MANAGER`/
`ORDER_MANAGER`/`FINANCE`/`SUPPORT`/`VIEWER`) replacing Handoff 08's
temporary "owner of the order" seller-ops auth entirely, with a
deliberate, documented divergence from Provider OS (every route always
resolves membership from its own `:sellerId` route param, never an
implicit "active organization") and a last-owner safeguard that can never
be bypassed by role-change or removal; offer/inventory management with a
new `InventoryMovementService.applyOnHandDelta()` mutation surface that
reuses `InventoryReservationService`'s exact row-lock oversell-protection
pattern and writes an append-only `InventoryMovement` audit trail for
every adjustment; a `MarketplaceChannelAdapter` interface
(`DEV`/`TOROB`/`DIGIKALA`) mirroring `PaymentGateway`/`ShippingGateway`'s
own adapter discipline exactly, with `DevMarketplaceAdapter` fully
functional and Torob/Digikala built as sandbox-honest, extensively
documented adapter boundaries (no official docs/credentials exist for
either); `MarketplaceOrder` ingestion with real
`@@unique([channelAccountId, externalOrderId])` idempotency, a genuinely
tested oversell-protection race, and a corrected transactional pattern
(claim-then-transact) after a P2002-inside-`$transaction()` bug was found
and fixed while writing the idempotency test; marketplace orders mapped
to real internal `Order`/`OrderItem` rows for seller-visibility without
auto-creating a `Fulfillment` (PET LIFE OS never assumes it owns
marketplace last-mile delivery); listing sync/reconciliation that never
overwrites canonical PET LIFE OS inventory with what a marketplace
reports and never hides a sync failure behind a generic success badge;
Handoff 08's `ShippingOrchestrator` seller-ops actions (mark ready for
pickup/request courier/cancel/reconcile) re-pointed at real
`SellerMembership` authorization at the exact same URLs, with zero
logistics-logic duplication; a completely separate Seller Shell UI
(own store, own route group, own session bootstrap) with full Persian
RTL/English LTR support; every Handoff 01-08 backend/frontend test still
green (159 backend e2e scenarios, 110 frontend tests); and backend e2e
coverage for all six required manual-verification flows (Flow A: seller
dashboard reacting to an inventory/price change; Flow B: the full DEV
marketplace publish→sync lifecycle; Flow C: an external marketplace order
becoming a visible internal Order with inventory decremented; Flow D: a
duplicate marketplace event producing exactly one of everything; Flow E:
cross-seller isolation across inventory/orders/listings/team/channels;
Flow F: a reconciliation mismatch surfacing a degraded listing state
without touching canonical inventory) plus the two required concurrency
races, executed via the same real-HTTP supertest-driven approach every
prior handoff's "browser E2E" used. Torob/Digikala financial settlement
was deliberately kept out of this handoff's scope per the spec, reserved
for a dedicated future financial handoff (see "Next recommended coding
handoff" below).

Everything in the Handoff 10 acceptance criteria: a coherent `Domain
Event → Notification Decision → Preferences/Quiet Hours → Template →
Channel Delivery → History` pipeline that no domain module bypasses
(every notification, across every category, is created through exactly
one write path, `NotificationOrchestratorService.notify()`); a real
idempotency anchor (`Notification.@@unique([domainEventId, type,
userId])`) fed by a minimal, additive, backward-compatible change to the
existing outbox (`DomainEventsService.publish()` now forwards
`DomainEvent.id` as an extra `emit()` argument every pre-existing
listener simply ignores); a provider-neutral `MessagingGateway`
(`DEV`/`FARAZ`) mirroring `PaymentGateway`/`ShippingGateway`/
`MarketplaceChannelAdapter`'s own interface-plus-capability-map-plus-
registry discipline exactly, with `DevMessagingAdapter` fully functional
and `FarazSmsAdapter` built as an honestly-documented sandbox boundary
(no official Faraz SMS docs/credentials exist for this project); an
explicit delivery state machine that never conflates `SENT` (provider
accepted) with `DELIVERED` (provider confirmed); bounded exponential-
backoff retries for transient failures and immediate termination for
permanent ones, both proven by dedicated e2e tests including two
concurrency races (the same domain event processed concurrently, and the
same delivery claimed by two concurrent workers) that use real DB-level
claiming rather than timing assumptions; quiet-hours deferral built on
pure ICU clock semantics with an explicit `URGENT`-only bypass; a
category/channel preference grid where `SECURITY` is structurally
non-suppressible and `MARKETING` defaults to disabled via a new, minimal
`CountryConfig` rather than the general "no row means enabled" rule;
SMS copy that is privacy-safe by construction (a template either has no
`smsBody` at all, or one deliberately written to omit medical/diagnostic
detail) with destinations always stored masked; a real notification
center and preferences UI reachable from a header bell, with restrained
priority/category presentation and full Persian RTL/English LTR support;
local dev-OTP authentication left completely untouched and independent
of Faraz; every Handoff 01-09 backend/frontend test still green (174
backend e2e scenarios, 120 frontend tests, including one test that
triggers a real — not dev-simulated — `MarketplaceListingSyncFailed`
event end to end to prove the domain-event-to-notification wiring itself,
not just the orchestrator in isolation); and dedicated e2e coverage for
all ten required flows (A: in-app create/read/unread-count; B: a
disabled category preference skipping SMS with the reason recorded; C: a
real DEV SMS send recording a provider message id; D: duplicate-event
idempotency; E: bounded transient retry-then-success; F: immediate
permanent failure with no retry; G: quiet-hours deferral plus the
URGENT bypass; H: health-category SMS privacy; I: cross-user isolation;
J: cross-seller isolation via a genuinely-triggered domain event) plus
the two concurrency races described above.

Everything in the Handoff 11 acceptance criteria: an internal operating
system for PET LIFE OS's own teams, built as a genuinely separate
identity/authorization axis (`AdminUser`, never granted from a consumer
session alone) with least-privilege RBAC across 9 roles enforced by a
static permission map and a real guard on every route; a Customer/
Household/Pet 360 view composing existing tables into one aggregate, with
PII masked by default and reveal always audited; Support Cases with a
centrally-validated state machine and strict PUBLIC/INTERNAL message
visibility (proven never to leak internal content to a customer-scoped
read); append-only Internal Notes and Tasks/follow-ups; Disputes whose
schema has no foreign key to `Refund` at all, so a resolution can never
auto-trigger a refund (proven directly via ledger/refund-count
assertions), with append-only Evidence; Trust & Safety operations that
mutate real operational-status fields (`verificationStatus`/`status`)
rather than ever hard-deleting a subject, plus an Appeal lifecycle;
minimal read-only order financial visibility with refund initiation
routed exclusively through Handoff 07's existing `RefundsService` (zero
changes to it) and genuine two-person control above a configurable IRR
threshold, enforced at both the application layer and a database `CHECK`
constraint; a full audit trail for every sensitive action with
reason-required enforcement; a completely separate Admin frontend shell
at operational density; concurrency safety for every identified race
(case/dispute/trust-case transitions, refund double-execution) via the
same `SELECT ... FOR UPDATE` row-locking discipline `InventoryReservationService`
established in Handoff 06; Support notifications routed through Handoff
10's existing `NotificationOrchestratorService` unchanged; every Handoff
01-10 backend/frontend test still green (188 backend e2e scenarios — 2
pre-existing, documented flaky timeouts unrelated to this handoff, see
Known limitations — and 138 frontend tests); and backend e2e coverage for
all twelve required flows (A: RBAC denies a permission-lacking role; B:
Customer 360 aggregation across domains; C: PII masked by default,
reveal audited; D: Support Case state machine + PUBLIC/INTERNAL
visibility enforcement; E: Dispute resolution leaves Refund count
unchanged; F: concurrent case-transition race resolves to exactly one
winner; G: Trust action mutates a real operational-status field, never a
delete; H: Appeal lifecycle; I: refund below threshold executes
single-admin; J: refund at/above threshold requires a distinct approver,
self-approval rejected; K: refund double-execution race is a safe
no-op; L: audit log records reason-required actions) plus the two
required concurrency races.

Everything in the Handoff 12 acceptance criteria: three real sign-in
methods — Google (a genuine Authorization Code flow with state/nonce/
PKCE-style handshake, id_token verified against Google's own JWKS, off by
default via `GOOGLE_AUTH_ENABLED` so the app works fully with zero
credentials configured), phone/email OTP (fully preserved, untouched),
and username/password (Argon2id, case-insensitive usernames, enumeration-
resistant errors) — all converging on the same `User` identity through a
new `AuthIdentity` table that makes account linking (a verified Google
email matching an existing password/OTP account) safe and duplicate-free,
proven end to end via a dedicated dev-only simulate endpoint since there
is no honest way to fake a real third party's cryptographic signature
locally; registration and password change/reset (single-use hashed
tokens, a reset revokes every existing session); public browsing for
vet/service/shop discovery via a new `OptionalSessionAuthGuard` that
personalizes for a signed-in caller but never requires one, with the
frontend's own `(public)` route group and `PublicShell` never redirecting
an anonymous visitor away; auth-on-action for every gated action (booking
creation, add-to-cart) via a reusable `RequireAuth` wrapper — a visitor
lands back on their original intent after signing in, never bounced to
Home; one shared, allow-list-shaped `returnTo` sanitizer used identically
by the real OAuth redirect and the client-side OTP/password flows,
preventing open redirects; one shared `resolvePostAuthDestination()`
function enforcing "Auth != onboarding" for every sign-in method; a fully
self-contained local-dev demo account (`demo`/`dev-only-password`) needing
no OTP-log-reading step; and every Handoff 01-11 backend/frontend test
still green (201 backend e2e scenarios — the two pre-existing documented
cold-Prisma-connection-pool-warmup flakes recur, plus this handoff's own
public-discovery test shares the identical symptom on the same
`ProviderOrganization` query and is given a generous explicit timeout
rather than a shorter default, see Known limitations — and 178 frontend
tests). Backend e2e coverage for all twelve required scenarios (anonymous
browsing reaches public discovery; a private endpoint still rejects an
anonymous caller; username/password register→logout→login; duplicate-
username rejection; enumeration-resistant wrong-password/no-such-user;
a mocked Google login creates and then reuses one User; verified-email
account linking; an unverified email is never trusted; forgot/reset
password with old-session revocation and single-use-token enforcement;
onboarding starts incomplete after registration; Provider OS/Seller OS
remain private; first-password-set vs. change-requires-current-password)
plus dedicated `sanitizeReturnTo`/`resolvePostAuthDestination` unit tests
on both sides and frontend component tests for `RequireAuth` and the
welcome/register pages.

Everything in the Handoff 13 acceptance criteria: a consumer-facing User
Support Center (Support Home, My Tickets, Create Ticket, Ticket Detail)
reading and writing the exact same `SupportCase`/`SupportMessage` tables
Handoff 11's admin workspace already used — never a parallel ticket
system; a simplified five-value user-facing status
(`SUBMITTED`/`UNDER_REVIEW`/`WAITING`/`RESOLVED`/`CLOSED`) derived from the
real `SupportCaseStatus` on every read, never stored separately; INTERNAL
notes/messages structurally absent from every consumer-facing response
type and query, not merely filtered; priority impossible for a normal
user to set (no such field on the consumer create DTO, enforced by the
global `forbidNonWhitelisted` validation pipe); IDOR-safe ownership
validation before a user-created case can reference a household, pet,
order, or booking; a user-triggered reopen path (`RESOLVED`/`CLOSED` →
`OPEN`) kept structurally separate from the admin transition map, with a
concurrency test proving exactly one of two simultaneous reopen attempts
succeeds; H10 notification coverage for every "notify user when" case the
spec lists (support replies, a meaningful status change, resolution, more
information requested) with a self-notification guard so a user's own
reply never notifies themself; SLA foundation timestamps
(`firstResponseAt`/`lastUserMessageAt`/`lastAdminMessageAt`) with derived
first-response/resolution durations computed on read, deliberately no SLA
engine; an admin ticket-detail context panel (household/pet/related-entity
summaries, the requester's previous tickets, the two derived SLA
durations) and additive `category`/`search`/date-range queue filters;
"Get support" contextual entry points on Order Detail and Booking Detail
prefilling the new ticket form; and every Handoff 01-12 backend/frontend
test still green (212 backend e2e scenarios — the three pre-existing
documented cold-Prisma-connection-pool-warmup timeout flakes recur,
unrelated to this handoff's own 11 new scenarios, all of which pass
cleanly — and 172 frontend tests, up from 159). Backend e2e coverage for
all required scenarios (a user-created ticket is immediately visible
through the admin endpoint as the same SupportCase; an admin's PUBLIC
reply reaches the user and notifies them while an INTERNAL note/message
never does; a user's own reply is visible to admin and never
self-notifies; the simplified status collapses admin-only states and
notifies on "more information requested"; resolution and reopen, correctly
gated to RESOLVED/CLOSED; cross-user isolation on every consumer-facing
route; priority cannot be set by a user; IDOR-safe reference validation
for order/booking/household; the reopen concurrency race; admin queue
filters; the admin context panel) plus frontend component tests for the
four new consumer pages and the two extended admin views.

Everything in the Handoff 14 acceptance criteria: order financial
attribution for both direct PET LIFE OS checkout sales and external
marketplace sales, each producing exactly one immutable
`OrderFinancialBreakdown` snapshot via a configurable, seller/channel-aware
`CommissionRuleService` (seeded platform default 10.00%), with the
platform's commission always computed as a derived balancer
(`order.totalAmount − sellerNetIrr`) so every resulting ledger posting
balances exactly by construction, never by rounding coincidence; a real
per-seller double-entry subledger (`SellerLedgerAccount`/
`SellerLedgerTransaction`/`SellerLedgerEntry`) mirroring Handoff 07's
platform-wide `LedgerService.recordBalanced()` discipline exactly, with a
derived (never stored) `pending`/`available`/`reserved`/`paid` balance and
a single-flip `sellerSettlementId` field as the entire sweep/idempotency
mechanism; a `Calculate → Approve → Payout` settlement lifecycle with
genuine two-person control (mirroring `AdminRefundApproval`'s own
self-approval guard and DB `CHECK` constraint) above a configurable IRR
threshold, and row-locking concurrency safety proven directly against real
Postgres races (two concurrent `calculate()` calls for the same period,
two concurrent `payout()` calls on the same settlement, and a refund
racing a settlement calculation, all resolving to exactly one correct
outcome, never a lost or duplicated amount); refund and adjustment
financial impact posted as fresh unswept ledger transactions rather than
ever rewriting an already-settled settlement's own history; an honest
marketplace settlement import + reconciliation foundation (manual/
CSV-shaped import only, since no official Torob/Digikala settlement API
exists — see the dedicated section above) that only ever flags findings
(`MATCHED`/`MISMATCH`/`MISSING_INTERNAL`/`MISSING_EXTERNAL`/`DUPLICATE`/
`REVIEW_REQUIRED`) and never auto-corrects a canonical financial record; a
real admin RBAC extension (`sellerFinance.view` plus four
`settlement.*` mutation permissions) with `SUPPORT` receiving none of
them and `FINANCE`/`SUPER_ADMIN` receiving every one, proven by a
dedicated e2e test; notifications routed through Handoff 10's existing
`NotificationOrchestratorService` unchanged and audit logging routed
through Handoff 11's existing `AdminAuditLogService` unchanged; a Seller
OS Finance section (summary/transactions/settlements/settlement detail)
and an Admin Finance + Reconciliation workspace, both rendering every
amount through the one existing `formatCurrency()` Toman-display helper;
deterministic seed data with no real bank details anywhere; and every
Handoff 01-13 backend/frontend test still green (229 backend e2e
scenarios — the three pre-existing documented cold-Prisma-connection-pool-
warmup timeout flakes recur, plus a fourth, previously-undocumented
instance of the identical symptom on the non-vet provider-services
discovery path was found and given the same generous explicit timeout
during this handoff's own final verification pass, see Known limitations —
and 196 frontend tests, up from 184). Backend e2e coverage for all
fifteen required flows (A: a direct checkout sale attributes economics and
grows pending receivable; B: a DEV marketplace sale never fabricates a
PaymentIntent; C: a large settlement requires approval before payout; D: a
settlement-calculation concurrency race is provably safe, exactly one
settlement stands; E: a pre-settlement refund reduces pending receivable;
F: a post-payout refund creates a negative carry-forward without rewriting
paid history; G/H: reconciliation MATCHED vs. MISMATCH with correct
variance; I: duplicate statement import converges, never duplicates; J:
cross-seller finance isolation; K: SUPPORT excluded from settlement
authority, FINANCE included; L: settlement self-approval rejected; M: a
refund-vs-settlement-calculation race is safe; N: a settlement-payout
concurrency race posts exactly one payment; O: every ledger transaction in
the whole test file balances) plus dedicated coverage for adjustment
creation, reconciliation resolve non-mutation, and the support-case
context-panel financial reference resolution.

Everything in the Handoff 15 acceptance criteria: an Article/ArticleLocale/
Category/Tag/ContentAuthor/MediaAsset/ContentVersion domain model with no
arbitrary page-builder generalization; a four-state
(`DRAFT`/`VISIBLE`/`HIDDEN`/`ARCHIVED`) article lifecycle enforcing exactly
the five spec-listed transitions, with editing and publishing kept
permanently separate actions; fa/en localization edited and published fully
independently, with explicit per-locale slugs and duplicate-slug rejection;
a closed, structurally-sanitized `RichTextDocument` vocabulary rendered
identically by the admin preview and the public article page; append-only
version history with restore always producing a new version, never rewound
history; preview reusing the existing authenticated admin endpoint rather
than new infrastructure; a completely separate CMS media upload namespace
and authorization boundary from any pet/health document; locale-aware SEO
fields with no fabricated defaults; a fully VISIBLE-scoped-at-the-database
public Blog (index/article/category/tag pages, "Load more" pagination,
localized empty states); a full Admin CMS workspace (article list/editor/
preview/version history, Categories/Tags/Media/Placements); typed,
layout-free Landing/Home content placement hooks Codex's own Landing
implementation was never modified to consume; a new `EDITOR` admin role
kept distinct from the pre-existing trust-and-safety `CONTENT` role, with
publishing kept `ADMIN`/`SUPER_ADMIN`-only and `SUPPORT` granted no
`content.*` permission at all; full `AdminAuditLogService` coverage for
every CMS mutation; and no AI content generation/editing/SEO/translation
or social publishing anywhere in this handoff, per its explicit scope line.
Every Handoff 01-14 backend/frontend test remains green (246 backend e2e
scenarios, 17 new for this handoff's Flows A-T — one pre-existing,
unrelated Handoff 03 test timeout reproduced as a flake during this
handoff's own final verification pass and passed cleanly on an isolated
re-run, see Known limitations — and 227 frontend tests, up from 196).
Backend e2e coverage for all twenty required flows (A: an editor creates a
DRAFT; B: a DRAFT is invisible on every public read; C/D: an ADMIN
publishes and the article becomes publicly visible; E/F: fa publishes
alone and en is added/published independently without touching fa; G: an
EDITOR cannot publish; H: SUPPORT has no content.* permission at all; I: a
HIDDEN locale disappears publicly and can return to VISIBLE; J: an
ARCHIVED locale is publicly unavailable and can never transition back; K:
saves build a version history; L: restore creates a new version without
mutating the old one; M: a duplicate slug is rejected; N: the public list
excludes DRAFT; O/P: preview works for an authorized editor and is blocked
anonymously; Q: unsafe/unrecognized rich text is rejected; R: public
pagination is deterministic; S: media upload/confirm authorization, MIME/
size validation, and disabled-media selection rules; T: a placement update
is audited).

Everything in the Handoff 16 acceptance criteria: a genuinely separate
Subscription/Payment/Entitlement state model, never conflated; an explicit
`SubscriptionStatus` state machine with a documented `ALLOWED_TRANSITIONS`
table; a real, self-healing FREE plan every household resolves against
(never a hardcoded-plan-name fallback); a reusable `EntitlementService`
(`has`/`getLimit`/`getUsageItem`/`assertWithinLimit`) that is the *only*
place any feature checks a plan capability — no `if plan === PREMIUM`
anywhere; derived (not counter-based) metering for `pets.max`/
`household.members.max`; server-side `pets.max` enforcement wired into
`PetsService.create()`, returning a typed, specific error, never a generic
one, with over-limit existing data always left fully accessible; the
entire H07 payment stack reused through a minimal internal Checkout/Cart
shell rather than a second payment system or a loosened core commerce
schema; trial/purchase/upgrade/downgrade/cancel/resume with an explicit,
documented no-proration policy; an honest DEV/manual renewal adapter
(never simulated production autopay) driving `PAST_DUE` →
`GRACE_PERIOD` → `EXPIRED` with full access retained through every step but
the last; refunds that never auto-infer a subscription-status change;
row-lock-then-fresh-read concurrency safety on every subscription mutation
(a genuine stale-read-before-lock race was found and fixed mid-build, see
that section above); a full admin surface (plan/price CRUD, household
subscription search/detail, billing-attempt refund, entitlement
override grant/revoke) behind H11's RBAC with `subscription.entitlement.
override` kept SUPER_ADMIN-only; household-wide, locale-correct
subscription notifications through the existing NotificationOrchestrator
only; a subscription summary added to H13's support context panel; a
consumer Manage Subscription + Plans UI reachable from Home, and an admin
Subscriptions section; a deterministic seeded FREE/Plus/Premium catalog;
and no AI plans, no social/travel/insurance billing, no provider/seller
SaaS billing, no coupons/promotions/referral/gift/affiliate billing, no
family plans, and no complex usage-based billing anywhere in this
handoff, per its explicit scope line. Every Handoff 01-15 backend/frontend
test remains green (272 backend e2e scenarios, 26 new for this handoff —
covering free entitlement resolution, limit enforcement, trial
eligibility, purchase/upgrade/idempotency, downgrade/cancel/resume,
renewal success/failure through the full `PAST_DUE`/`GRACE_PERIOD`/
`EXPIRED` chain with FREE fallback and no data loss, entitlement
overrides, the full admin surface, and concurrent-purchase/concurrent-
cancel races — and 243 frontend tests, up from 227).

Everything in the Handoff 17 acceptance criteria: sixteen new provenance-
tagged Health/Clinical models (`MedicalDocument`, `MedicalRecordCorrection`,
`LabResult`, `ImagingStudy`, `Referral`, `DentalRecord`,
`ClinicalNutritionPlan`, `RehabPlan`/`RehabSession`, `PetObservation`,
`ClinicalVisit`/`ClinicalVisitRevision`, `CarePlan`/`CarePlanItem`,
`SeniorCareNote`, `EndOfLifeCarePlan`), all ten locked health principles
enforced in code (provider-original immutability via
`assertOwnerEditable()`, owner corrections as new rows via
`MedicalRecordCorrection` that never touch the original, `Unknown ≠ Normal`
via a `flag` that is `null` unless a provider explicitly set it, `Missing ≠
Healthy` via explicit `EmptyState` copy everywhere, no AI source anywhere,
no duplicated Jalali backend values); a real private-document signed-
download capability added to the storage layer (it did not exist before
this handoff); a new, deliberately narrow `canRecordClinicalData`
`PetAccessGrant` flag as the sole mechanism authorizing provider clinical
authorship, set only by a `VET`-category booking grant; a `ClinicalVisit`
lifecycle kept wholly separate from `Booking`, with append/supersede/void
semantics everywhere a provider-authored record needs to change
(`ClinicalVisitRevision`, `LabResult.supersedesId`,
`MedicalDocument`/`ImagingStudy` void fields); owner observations that are
always rendered as observations, never diagnoses; a `Referral` state
machine independent of `BookingStatus`; asymmetric entitlement gating
(`health.documents.max`/`health.observations.max` gate only owner-initiated
creation, never provider-authored clinical content, and never an existing
record); five new notification templates with a stricter SMS privacy bar
than the existing precedent; a coarse, three-field
`SupportCaseContextDto.health` summary that never leaks a document title or
lab value; ten consumer routes and two provider Clinical OS views; and a
genuine concurrent-completion lost-update race found and fixed in
`ClinicalVisitService` during this handoff's own build (see the dedicated
section above). Every Handoff 01-16 backend/frontend test remains green
(287 backend e2e scenarios, 15 new for this handoff — covering owner
document upload/authorization, provider document provenance and
immutability, owner corrections alongside an unaltered original, `Unknown`
semantics never rendered as `Normal`, a full clinical visit start →
document → complete → amend cycle with a preserved revision, labs,
imaging, independent referral state, provider care plans, owner
observations, entitlement-limit enforcement with existing data staying
fully accessible, support-context privacy, cross-household isolation,
provider-grant isolation, and the concurrent-visit-completion race — and
267 frontend tests, up from 243, covering the health overview's deliberate
absence of a numeric score, the timeline's always-present provenance
indicator, document provenance badges, labs/imaging/referrals rendering
only explicitly-provided provider data, the owner-observation disclaimer,
the provider clinical patient view, and completed-visit amendment-only
immutability).

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
  **resolved by Handoff 09** for the commerce surface (a real Seller OS
  dashboard/order view/inventory management/team now exists — see the
  Handoff 09 section above) **and resolved by Handoff 14** for seller
  settlement (a real double-entry seller subledger, a `Calculate → Approve
  → Payout` settlement lifecycle with two-person control, and real postings
  to `SELLER_PAYABLE`/`PLATFORM_REVENUE` for both direct and marketplace
  sales now exist — see the Handoff 14 section above).
- **No promotion engine** — `Checkout.discountAmount`/`promotionCode` are
  placeholder fields only; nothing ever sets a non-zero discount or
  validates a code this phase.
- **Refunds are full-only, consumer/dev-initiated, and never reach
  `PARTIALLY_REFUNDED`** (Handoff 07 implemented the rest) — `Refund`
  entities and a full `REFUND_NOT_SUPPORTED` rejection path for any
  partial amount exist and are exercised end to end, but no provider here
  has a confirmed partial-refund capability, so `OrderStatus.
  PARTIALLY_REFUNDED`/`FinancingIntentStatus.PARTIALLY_REFUNDED` stay
  unreachable; at the time of this handoff there was also no admin/support
  role model yet, so any signed-in owner of an order could request its own
  refund (spec: "consumer refund initiation may be limited... implement
  internal/dev refund route and owner-visible status only") — Handoff 11
  has since added a real `AdminUser`/RBAC model and a two-person-control
  admin refund flow (`AdminRefundService`) layered on top of this same
  `RefundsService.request()` without changing it; this consumer-initiated
  path remains as-is alongside it.
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
- **No admin/support role model at the time of this handoff** — the
  internal payment/financing ops view (`GET /checkout/:id/ops`) and the
  refund endpoints were reachable only by session auth plus ownership,
  exactly like every other consumer endpoint, with no separate ops/
  support account type or audit trail of who looked at a checkout's
  payment history. Handoff 11 has since introduced exactly that (a real
  `AdminUser`/RBAC model, `GET /admin/orders/:orderId/financials` for
  read-only financial visibility, and a fully audited admin refund flow);
  this section is left as a historical record of Handoff 07's own scope.
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
- **No Seller OS / seller-ops auth model** (Handoff 08) — **resolved by
  Handoff 09**: `mark ready for pickup`/`request courier`/`cancel`/
  `reconcile` now require real `SellerMembership` authorization on the
  order's own seller organization, via the exact same `ShippingOrchestrator`
  methods (re-pointed, never duplicated) — see the Handoff 09 section
  above.
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
- **No Torob/Digikala financial settlement** (Handoff 09) — **resolved by
  Handoff 14** for the internal half: a marketplace order now posts a real
  `PLATFORM_REVENUE`-only commission entry (never a fabricated full-payment
  entry, since the marketplace collects the customer's payment, not PET
  LIFE OS) and flows through the same seller subledger/settlement engine as
  a direct sale — see the Handoff 14 section above. The *external* half —
  a real Torob/Digikala settlement/payout API — remains genuinely
  unavailable (no official docs or credentials exist for this project);
  Handoff 14's marketplace statement import/reconciliation is the honest
  manual/CSV-shaped substitute the spec asked for in that API's absence.
- **No real merchant credentials or official docs for Torob or Digikala**
  (Handoff 09) — both adapters are documented sandbox boundaries sharing
  `DevMarketplaceAdapter`'s own simulation engine (see the Handoff 09
  section above for exactly what's marked UNKNOWN); no live publish/
  inventory-push/price-push/order-pull round-trip or real webhook/polling
  scheme exists for either, and there is no real inbound marketplace
  webhook endpoint — ingestion is exercised entirely through the
  dev-simulate routes, which drive the real ingestion pipeline.
- **No auto-created Fulfillment for marketplace orders** — a marketplace
  order becomes a real internal `Order`/`OrderItem` (for seller
  visibility/reporting) but deliberately does not auto-create a
  `Fulfillment`/`Shipment`; PET LIFE OS must never assume it owns
  marketplace last-mile delivery. `Fulfillment.deliveryResponsibility`
  (`PETLIFE_OS`/`MARKETPLACE`) exists in the schema for a future handoff
  to wire actual delivery-responsibility logic without another migration.
- **The unified Seller Orders view merges two queries in application
  code, not a single SQL query** — `SellerOrderService` queries PET LIFE
  OS checkout-origin `Order`s and marketplace-origin `Order`s separately
  and merges/sorts them in memory; acceptable at current scale, but a
  future handoff adding pagination-at-scale across both sources should
  revisit this as a single query (e.g. a materialized view or a shared
  index) rather than two.
- **`OrdersService.createForCheckout()` has the same latent
  P2002-inside-`$transaction()` shape** the Handoff 09 marketplace
  ingestion bug was found and fixed in, but is never actually triggered
  in practice — `CheckoutService`'s own `checkout.status === CONFIRMED`
  short-circuit prevents ever reaching the vulnerable retry branch.
  Documented here rather than fixed, since it's out of this handoff's
  scope and genuinely unreachable through the public API today.
- **No listing pause/reactivate distinction in the UI, and no bulk listing
  operations** — `MarketplaceListingService` supports `publish`/
  `deactivate`/`sync`/`reconcile` per listing; there is no "pause all
  listings for this channel" or bulk price-update action yet.
- **No seller invitation email/notification, and no accept/decline flow**
  — `SellerTeamService.invite()` requires the invited person to already be
  a registered PET LIFE OS user (looked up by email/phone) and creates
  their `SellerMembership` directly as `ACTIVE` (auto-accepted); there is
  no email/SMS sent, no `PENDING`-status invitation a person confirms
  themselves, and no way to invite someone who hasn't signed up yet.
- **No real merchant credentials or official docs for Faraz SMS**
  (Handoff 10) — `FarazSmsAdapter` is a documented sandbox boundary
  sharing `DevMessagingAdapter`'s own simulation engine (see the Handoff
  10 section above for exactly what's marked UNKNOWN); no live send
  round-trip, delivery-status callback, or real webhook signature scheme
  exists. There is also no real inbound messaging webhook endpoint —
  outcome simulation is exercised entirely through the
  `POST /dev/notifications/simulate`/`force-attempt` routes, which drive
  the real orchestration/delivery pipeline, never a shortcut around it.
- **`EMAIL`/`PUSH` are defined in the `NotificationChannel` enum but
  completely unreachable** — no adapter, template variant, or UI control
  ever produces or displays them; the vocabulary exists so a future
  handoff can wire either without a schema change, exactly like
  `HealthSeverity` beyond `ATTENTION` or `BookingStatus.HOLD` before their
  own handoffs reached them.
- **`NotificationTemplate` exists in the schema but nothing persists to
  it** — H10's own templates are code-defined constants in
  `notification-templates.ts`, matching how every other transactional
  copy in this codebase already lives in source rather than a database; a
  future content-managed system would swap the resolver's lookup order,
  not the schema.
- **No real-time delivery to the notification bell** — `NotificationBell`
  polls `GET /notifications/unread-count` every 30 seconds; there is no
  websocket/SSE infrastructure in this codebase, so a new notification
  can take up to that long to show up as an unread badge without a manual
  refresh of the notification center itself.
- **No dedicated Account/Settings section** — this codebase has never
  built one (not in Handoffs 01-09 either); notification preferences live
  at `/notifications/preferences`, reachable only via a settings-gear icon
  in the notification center's own header, rather than under a general
  profile/settings area a future handoff should introduce.
- **Quiet-hours end-time math assumes no DST transition between "now" and
  the computed instant** — exact for Iran (no DST since 2022, the only
  real `CountryConfig` entry today), but a future country with an active
  DST rule would need a real timezone-offset lookup in
  `notification-quiet-hours.util.ts`, not the current local-clock-minutes
  delta approach.
- **The background delivery worker is a plain `setInterval` poller, not a
  real job queue** — sufficient for this phase's volume and explicitly
  the smallest mechanism the spec asked for (no Kafka/RabbitMQ, no new
  dependency); a future handoff expecting significantly higher notification
  volume should revisit this before it becomes a bottleneck.
- **No scheduled reminder types are actually implemented** (appointment/
  vaccine/service reminders) — the `scheduledAt`-driven deferral mechanism
  a real reminder would need already exists (it's the same mechanism
  quiet-hours deferral uses), but no domain event or cron trigger creates
  one yet; this was explicitly out of scope ("you do NOT need to build
  every reminder type in H10").
- **No Home integration** — per the spec's own "Home: what matters now,
  notification center: what happened / what needs attention" distinction,
  no notification-derived action surfaces on Home this phase; only the
  header bell and the dedicated notification center exist as entry points.
- **Notification preferences have no "seller view" distinction** — a
  seller's own `SELLER`/`MARKETPLACE` category preferences are the same
  per-user rows as their consumer notification preferences (there is no
  separate Seller OS-scoped preferences surface); acceptable since a
  seller's operational notifications and their consumer notifications
  already share the same recipient identity (a PET LIFE OS user account).

- **Admin AI Assistant is documentation-only** — the spec explicitly asked
  for this to be scoped and described, not built; no code exists for it in
  this handoff, deliberately.
- **Attachments are metadata-hooks-only** — `SupportMessage`/
  `DisputeEvidence` carry an `attachmentRef` string field for a future
  object-storage integration to populate, but no upload endpoint or
  storage adapter exists yet; a future handoff wires an actual upload
  flow behind this same field, no schema change needed.
- **Appeals have no dedicated frontend page** — `Appeal` submission/
  resolution is fully implemented and tested on the backend
  (`POST /admin/trust-actions/:actionId/appeals`,
  `PATCH /admin/appeals/:id/resolve`) and reachable inline from
  `AdminTrustCaseDetailView`, but there is no standalone appeals queue/
  list view.
- **Trust content-moderation subjects are schema-only** — `USER`/
  `HOUSEHOLD`/`LISTING`/`REVIEW`/`COMMUNITY_CONTENT`/`PET_INCIDENT`
  `TrustCase`/`TrustAction` rows are fully recorded and audited, but
  (unlike `PROVIDER`/`SELLER`, which flip a real `verificationStatus`/
  `status` field) these subject types have no enforcement field on their
  own models yet — a suspended `LISTING`, for example, is not yet hidden
  from consumer discovery by this action alone.
- **Verification reuses existing enums, no new KYC infrastructure** —
  `PATCH /admin/providers/:id/verification`/`/admin/sellers/:id/verification`
  transition the same `verificationStatus` fields Handoffs 05/09 already
  defined; no document-upload/KYC-provider integration was in scope.
  Search is Postgres `contains`/exact-match only, per the spec's own "no
  Elasticsearch this phase" allowance — a future handoff needing fuzzy/
  ranked search should introduce a real search index rather than
  extending this query pattern.
- **Two pre-existing, documented flaky e2e tests, unrelated to this
  handoff** ("returns only VERIFIED providers by default" from Handoff 03
  and its Handoff 04 counterpart) occasionally exceed their Jest timeout
  due to a cold Prisma connection-pool warm-up cost in this sandbox — a
  comment already in the test file dates this to earlier handoffs; it
  reproduced consistently across every full-suite run in this session and
  is not a new H11 regression.
- **`apps/api/prisma/seed.ts`'s pre-existing (Handoff 01-era)
  non-idempotency** — `main()` unconditionally `.create()`s the seed
  customer's Household/Pets/OnboardingProgress rows after only
  `.upsert()`-ing her `User` row, so re-running `pnpm db:seed` against an
  already-seeded database fails on a `P2002` unique-constraint violation
  unrelated to anything this handoff added. This handoff's own
  `seedAdmin()` addition was verified independently (idempotent — running
  it twice produces exactly one seeded support case) and left this
  existing bug unfixed per this handoff's explicit scope boundary; a
  clean fix is a small existence-check before each `.create()` call in
  `main()`, left for whichever session next has seed.ts in scope.
- **Password reset emails are logged to the server console in development,
  not actually sent** — there is no general transactional-email
  infrastructure in this codebase (OTP delivery is its own Redis-backed
  provider, not a mailer); a production deployment needs a real mail
  provider wired into `AuthPasswordResetService.requestReset()` before
  launch, the same pre-existing gap `DevOtpProvider`'s own doc comment
  already flags for OTP delivery.
- **`ACCOUNT_LINKING_CONFLICT` is defined but never thrown** — the
  account-linking logic this handoff actually needs (a verified Google
  email matching an existing account) always safely links rather than
  conflicting; the error is reserved for a future case (e.g. linking a
  second OAuth provider to an already-Google-linked account) that isn't
  built yet.
- **No frontend UI for changing an existing password** — `PUT
  /auth/password` is fully implemented and tested on the backend, but
  there is no dedicated Account/Settings page to drive it from (this
  codebase has never built a general settings section — see Handoff 10's
  own identical note about notification preferences).
- **A third occasionally-timing-out `GET /providers/vets` scenario, sharing
  the pre-existing cold-Prisma-connection-pool-warmup root cause already
  documented for Handoff 03/04's own flaky tests** — this handoff's Flow A
  (anonymous public browsing) happens to call the same endpoint and hit
  the identical symptom in this sandbox; given an explicit 60-second
  timeout (rather than the default 20s) since the query always eventually
  succeeds — proven directly by timing it standalone — this is host
  environment latency, not a hang or a real bug in the optional-auth
  change itself.
- **Rate limiting on the new auth endpoints (`@Throttle` decorators on
  register/login/forgot/reset/Google start/callback) has no dedicated e2e
  test** — the e2e suite's `ThrottlerModule` is configured to skip
  throttling entirely under `NODE_ENV=test` (`skipIf: () => process.env
  .NODE_ENV === "test"`, a pre-existing setting from Handoff 01 needed so
  the suite's own rapid-fire user creation doesn't self-throttle), so
  there is no way to exercise real rate-limiting behavior from this test
  suite; the decorators themselves mirror the exact `{limit, ttl}` shape
  already proven correct for the pre-existing OTP endpoints.
- **No Profile/Account page for a literal "Profile → Support" entry
  point** — this codebase has never built a general account/settings
  section (Handoff 10 and Handoff 12 each flag the same pre-existing gap
  for notification preferences and password change respectively); the
  Support Center is instead reachable from a small icon button in
  `AppShell`'s header, plus the two contextual "Get support" entry points
  on Order/Booking Detail the spec explicitly asks for.
- **`relatedEntityType` a user can self-link is limited to `ORDER` and
  `BOOKING`** — the only two contextual entry points the spec requires;
  the DTO's `@IsIn` allow-list means adding a third kind later (e.g.
  linking a case to a `Dispute`) is a one-line addition plus one new
  ownership-check branch in `assertUserOwnsReferences()`, not a schema or
  architecture change.
- **The admin RBAC permission scheme (`support.view`/`support.manage`) is
  unchanged** — kept as the existing two-tier scheme rather than split
  into finer-grained permissions (e.g. separate assign/resolve grants);
  every route still re-checks server-side, so this is a granularity
  choice, not a security gap, and splitting it is a low-risk follow-up if
  a future handoff needs it.
- **First-response-time/resolution-time are simple elapsed-time
  calculations, not a real SLA engine** — no business-hours calendar, no
  per-priority SLA targets, no breach alerting; exactly the scope the
  spec asked for ("do NOT build a complex SLA engine yet").

- **A fourth, previously-undocumented instance of the pre-existing
  cold-Prisma-connection-pool-warmup flake** (see the Handoff 03/04/12
  bullets above for the same root cause) was found during this handoff's
  final verification pass — "returns only VERIFIED providers by default
  when discovering non-vet services" (Handoff 04) occasionally exceeded
  the default 20s Jest timeout in this sandbox, exactly like its sibling
  `/providers/vets` test already documented; given the identical explicit
  60-second timeout rather than fixed by chasing the warm-up cost itself,
  since the query always eventually succeeds. Unrelated to any Handoff 14
  change.
- **Settlement payout is `MANUAL`-only, and genuinely never fakes a bank
  transfer** — `SellerFinancialAccount.payoutMethodType` is a plain string
  label (always `"MANUAL"` this phase; `payoutReferenceMasked` is a
  display-only masked string a future real payout integration would
  populate), and `AdminSellerSettlementService.payout()` only ever records
  that a payout *already happened outside this system* (spec: "never fake
  bank transfer success") — there is no real transfer, no payout provider
  adapter, and no bank account/credential field anywhere in the schema, by
  design. `SellerSettlementScheduleType.WEEKLY`/`BIWEEKLY`/`MONTHLY` are
  defined in the vocabulary (spec: "settlement may run on a cadence") but
  every seeded account uses `MANUAL`, and nothing schedules a recurring
  `calculate()` call yet — an admin always triggers one explicitly.
- **Commission resolution has no category-level matching** —
  `CommissionRuleService` matches seller-specific and channel-specific
  rows plus a platform default, but never a product-category-specific
  rate; a documented non-goal this phase (see the Handoff 14 section
  above), left for a future handoff if the business needs
  category-differentiated commission.
- **`NEGATIVE_PLATFORM_REVENUE` is a hard rejection, not an
  auto-adjustment** — if an order's discount is large enough that the
  derived `platformCommissionIrr` balancer would go negative (the
  commission owed can't cover the discount), attribution is rejected
  outright rather than the platform silently absorbing a loss or the
  seller's payout being reduced to compensate; this edge case is
  documented, not solved, this phase.
- **Marketplace settlement import has no CSV file upload** — the admin UI
  accepts one `externalOrderId,amount` pair per line in a plain textarea
  (`MarketplaceSettlementImportSource.MANUAL`), matching the backend's own
  "already-normalized lines, not CSV-specific parsing" design; there is no
  file picker, and `CSV_IMPORT`/`API` exist in the source-type vocabulary
  for a future handoff to actually wire a file parser or a real
  provider-fed importer behind, without any schema change.
- **Reconciliation has no scheduler, like Handoff 07's own payment/
  financing reconciliation** — `POST /admin/marketplace-settlements/import`
  is an admin-triggered action only; nothing periodically imports or
  reconciles a statement automatically.
- **A settlement-calculation concurrency loss is a full transaction
  rollback, logged as an `ERROR`** — the documented Flow D/M behavior (see
  the Handoff 14 section above): the losing racer's entire `calculate()`
  transaction throws and rolls back rather than partially succeeding, and
  Nest's global exception filter logs that thrown error at `ERROR` level
  before returning a `500` to the loser. This is the correct, intended
  outcome of the row-locking design (proven directly by the concurrency
  e2e tests, which assert exactly one settlement survives), not a crash to
  be silenced — a caller that loses this race should simply retry
  `calculate()`, which will see whatever remains genuinely unswept.
- **No settlement export/statement PDF** — a settlement's full breakdown
  is viewable in both the Seller OS and Admin UI, but there is no
  downloadable PDF/CSV settlement statement a seller could file for their
  own accounting; out of scope this phase.
- **`RichTextBlockEditor` is a minimal, dependency-free block editor** —
  per-block type selection and a single plain-textarea inline text run;
  there is no inline formatting UI (bold/italic/code/link buttons within a
  paragraph) this phase, even though the underlying `RichTextDocument`
  type and renderer both already fully support marks and links. Adding a
  richer inline-formatting toolbar is additive — it needs no schema,
  validation, or renderer change, only a new editor UI writing the same
  `RichTextInline` shapes `validateRichTextDocument()` already accepts.
- **`Category`/`Tag` are intentionally flat, no nesting** — a documented,
  deliberate restraint (spec: "do not over-generalize"), not an oversight;
  a future handoff could add an optional `parentId` if the catalog of
  topics genuinely grows to need hierarchy.
- **No scheduled/future-dated publishing** — `publish()` always takes
  effect immediately; there is no "publish at this future timestamp"
  mechanism. `ArticleLocale.publishedAt` is fully ready to support one
  (it's already the timestamp a scheduler would set), but no trigger exists
  yet.
- **Media dimensions are client-supplied, not server-verified** — a
  confirming admin's browser decodes the image and reports
  `widthPx`/`heightPx`; the server never opens the uploaded bytes itself
  (no native image-processing dependency was added this phase). A
  malformed or mismatched value would only affect display sizing hints,
  never security, since MIME type and file size are still validated
  server-side.
- **Another recurrence of the pre-existing cold-Prisma-connection-pool-
  warmup flake** (see the Handoff 03/04/12 bullets above for the same root
  cause) during this handoff's own final verification pass: "returns only
  VERIFIED providers by default" (Handoff 03) exceeded the default Jest
  timeout once in the full-suite run and passed cleanly on an immediate
  isolated re-run. This handoff touches no code that test exercises; left
  for Codex per "document, don't silently broaden scope" rather than
  investigated further here.
- **No proration** (Handoff 16) — an upgrade charges the new plan's full
  price and starts a brand-new period from now, with no partial credit for
  the unused portion of the prior period. This is the spec's own sanctioned
  simpler policy; a future handoff could add deterministic-integer-IRR
  proration with a full audit trail if the product later needs it.
- **Renewal is reactive, not proactive** (Handoff 16) —
  `SubscriptionRenewalWorkerService` only attempts a renewal once a
  period's `endAt` has actually passed, never N days in advance. This means
  `subscription.trial_ending`/`subscription.renewal_upcoming` (both listed
  as "potential" in the spec) are not implemented — there is no point in
  time to fire either notification without adding new proactive-scheduling
  infrastructure. A future handoff could add a "renewal due soon" scan.
- **No real recurring-charge integration** (Handoff 16) — renewals go
  through the same `DEV_SIMULATED`/synchronous-charge path every other H16
  charge uses; there is no real payment-provider webhook-driven autopay.
  This is the spec's own explicit, honest choice ("do not simulate
  production autopay") rather than an oversight — a future handoff would
  need a real recurring-charge-capable provider integration to change it.
- **`household.members.max` resolves but has no enforcement call site**
  (Handoff 16) — the entitlement is metered and would correctly block a
  household member invite/add over its limit, but this codebase has no
  invite/add-member endpoint yet (`HouseholdsController` only supports
  household creation). Documented rather than inventing a member-invite
  feature out of this handoff's scope; wiring the check in is a small
  addition once that feature exists.
- **`pets.max` enforcement is a soft, non-transactional check** (Handoff
  16) — `EntitlementService.assertWithinLimit()` is called before
  `PetsService.create()`'s own transaction begins, so two truly
  simultaneous pet-creation requests for a household already at its limit
  could both pass the check and both succeed, exceeding the limit by one.
  This is a deliberate, documented trade-off (a soft convenience limit, not
  a financial invariant, unlike the subscription-mutation row locks
  above) rather than an oversight; a future handoff could close it with a
  `COUNT(*) ... FOR UPDATE`-style check inside the pet-creation transaction
  if the product ever needs a hard guarantee here.
- **Admin plan/household/billing-attempt list pages have no paged
  controls** (Handoff 16) — each fetches one generously-sized page (up to
  the backend's own page-size cap) with a status filter, matching every
  other admin list view in this codebase (`AdminCustomersView`,
  `AdminAuditView`, `AdminSellerFinanceView`) rather than introducing a new
  pagination UI component. The backend's own pagination is real and ready
  to support paged controls later.
- **A genuine stale-read-before-lock concurrency bug was found and fixed
  during this handoff's own build**, not left in place: an early version
  of `SubscriptionBillingService.purchase()` read the Subscription row
  before acquiring its row lock and never re-read it afterward. Documented
  here (rather than silently mentioned only in code comments) because it
  is exactly the class of defect the spec's own concurrency-testing
  requirement exists to catch — see "Concurrency" under Handoff 16 above
  for the fix and its dedicated e2e coverage.
- **AI extraction/summarization/diagnosis is entirely out of scope**
  (Handoff 17) — `SourceType` has no `AI` value, `MedicalDocument` has no
  extracted-fields column, and no code path ever interprets an uploaded
  file's contents or a lab/imaging value. Explicitly deferred per the
  spec's own non-goals, not an oversight.
- **No pharmacy/prescription commerce, no external lab/imaging vendor
  integration, no wearable integration, no DNA/genetics, no insurance
  claims** (Handoff 17) — `Referral`/`LabResult`/`ImagingStudy` model the
  clinical side only; fulfillment/ordering integration with any of these
  remains a distinct, unbuilt future concern per the spec's explicit
  non-goals list.
- **`health.follow_up_due` is a defined notification template with no call
  site** (Handoff 17) — nothing in this handoff proactively schedules
  follow-up reminders (mirroring Handoff 16's own
  `subscription.trial_ending`/`renewal_upcoming` precedent); a
  `CarePlanItem` of type `FOLLOW_UP` is visible to the owner in their
  Health Overview today, but firing a reminder ahead of its `dueAt` needs
  the same kind of proactive-scan poller a future handoff could add
  without any schema change.
- **`ClinicalVisitStatus.DRAFT` is modeled but unreachable** (Handoff 17) —
  `start()` always creates a visit directly at `IN_PROGRESS` (this phase's
  one-step "provider starts a visit" action); `DRAFT` stays in the
  vocabulary for a future multi-step-drafting UI.
- **Care Plan follow-ups are not projected into Care Calendar** (Handoff
  17) — a `CarePlanItem` of type `FOLLOW_UP` is deliberately kept as its
  own record rather than also creating a `CareCalendarEvent`, to avoid a
  second, harder-to-keep-consistent reminder system; a future handoff
  could add that projection the same way a `Booking` already populates
  Care Calendar today.
- **Senior Care / End-of-Life have no scoring and no automated lifecycle
  trigger** (Handoff 17) — `SeniorCareNote`/`EndOfLifeCarePlan` are plain
  structured records; creating or reading either never changes a pet's
  lifecycle state, per the spec's explicit "do not trigger memorial
  lifecycle automatically" line.
- **`LocalStorageDriver`'s signed-download token is Redis-backed but
  single-use-ish, not a true one-time token with atomic claim-and-expire**
  (Handoff 17) — adequate for local development (the S3 driver's real
  presigned GET is what production would use), but a determined caller
  with the token before its TTL expires could reuse it; not a concern in
  the dev-only code path it guards.

## Next recommended coding handoff

**Landing/Home actually consuming the Handoff 15 content placement hooks**,
the natural next step now that a full, typed content control plane exists.
`ContentPlacement`/`ContentBlock` (`LANDING_HERO`/`LANDING_FEATURED_CONTENT`/
`HOME_EDUCATION`/`HOME_ANNOUNCEMENT`) and their public read API
(`GET /content/placements/:key`) are fully built and independently
testable, but by explicit design this handoff never wired them into
Codex's own Landing/Home visual implementation — that wiring is real
product surface work belonging to whoever owns those pages next (Codex or
a future handoff), reading the typed DTO this API already returns rather
than inventing a new shape. A related, smaller Handoff 15 follow-up: give
`RichTextBlockEditor` an inline formatting toolbar (bold/italic/code/link)
— the `RichTextDocument` type and `RichTextRenderer` already fully support
marks and links, so this is purely new editor UI, no schema/validation/
renderer change. A third, independent option: scheduled/future-dated
publishing (`ArticleLocale.publishedAt` already exists in the right shape;
only a scheduler/trigger is missing, the same `NotificationDeliveryWorkerService`-style
poller class of mechanism Handoff 10 already established, rather than a
new job-queue dependency).

Alternatively, **real payout execution + scheduled settlement automation**,
the piece Handoff 14 deliberately left `MANUAL`-only. A genuinely complete financial
settlement architecture now exists end to end (order attribution, a
real double-entry seller subledger, a two-person-control
`Calculate → Approve → Payout` lifecycle, refund/adjustment impact,
marketplace statement import + reconciliation, RBAC, notifications, and
audit — see the Handoff 14 section above), but `payout()` only ever
*records* that a transfer happened outside the system; there is no real
payout provider, no bank account/credential field, and no cadence that
triggers `calculate()` automatically (`SellerSettlementScheduleType
.WEEKLY`/`BIWEEKLY`/`MONTHLY` are modeled but unused — every seeded
account is `MANUAL`). A natural next step, reusing the exact adapter
discipline `PaymentGateway`/`ShippingGateway`/`MarketplaceChannelAdapter`/
`MessagingGateway` already established (an interface, a capability map,
a registry, a `DEV`-prefixed fully-functional default, and
sandbox-honest real-provider boundaries only where official docs/
credentials genuinely exist): (1) a `PayoutProvider` interface with a
`DevPayoutAdapter` that simulates a bank transfer deterministically,
mirroring `DevPaymentGateway`'s own precedent, so `payout()` gains a real
(if simulated) execution step instead of a bare status flip; (2) a
scheduled trigger (the same `setInterval`-poller class of mechanism
`NotificationDeliveryWorkerService` already uses, not a new job-queue
dependency) that calls `calculate()` per seller according to their
account's own `settlementSchedule`, finally giving that enum a reader;
and (3) once a real payout event exists, wire a `settlement.paid`
notification's existing template (already built in Handoff 14) to
include a real payout confirmation reference rather than the manually
entered `payoutReference` string. Keep `SellerLedgerService.recordBalanced()`'s
double-entry discipline, the sweep-flag idempotency mechanism, and the
two-person-control approval gate completely untouched — this handoff is
additive execution/scheduling logic layered on top of what Handoff 14
already built, never a rewrite of the settlement engine itself.

A related, smaller option this handoff also unlocks: `AdminSellerFinanceDetailView`'s
adjustment form and `AdminMarketplaceReconciliationView`'s import form are
both minimal, deliberately manual entry points (see the Handoff 14 section
above); a follow-up could add a settlement statement export
(PDF/CSV, per the Handoff 14 Known Limitations note above) a seller could
file for their own accounting — no schema or service change, purely a new
read-only rendering of data that already exists.

Alternatively, if the business prioritizes closing the remaining
external-provider gaps instead of building payout execution: once real
merchant credentials/official docs for SnappPay, DigiPay, a standard
payment gateway, AloPeyk, SnappBox, Torob, Digikala, or Faraz SMS become
available, swap the corresponding adapter's sandbox/simulation bodies for
real HTTP calls and a real webhook/signature scheme, without touching
`PaymentGateway`/`FinancingProvider`/`ShippingGateway`/
`MarketplaceChannelAdapter`/`MessagingGateway`'s shape — every adapter
already implements the full interface its capability map declares, so a
real integration is a same-class rewrite, not a new architecture.
`validatePaymentConfig()`/`validateShippingConfig()`/
`validateMarketplaceConfig()`/`validateMessagingConfig()` already refuse
to boot with `PAYMENT_SANDBOX_MODE=production`/`SHIPPING_MODE=production`/
`MARKETPLACE_SANDBOX_MODE=production`/`MESSAGING_SANDBOX_MODE=production`
unless the enabled provider's credential env vars are set, specifically
to make this transition safe — real Torob/Digikala credentials
specifically would also finally let a `MarketplaceSettlementImportSource
.API` importer replace Handoff 14's manual/CSV-shaped one. A third
option, if the business instead wants to build on the notification
foundation directly rather than close provider gaps or automate payout:
wire the first real scheduled reminder (an appointment or
vaccination-due reminder) using the `scheduledAt`-driven deferral
mechanism Handoff 10 already built for quiet hours — the
`NotificationDeliveryWorkerService` poller and `NotificationOrchestratorService.
notify()` need no change, only a new cron-like trigger deciding *when* to
call `notify()` for a given booking/pet. A fourth, orthogonal option: this
codebase has flagged the same missing general Account/Settings section
since Handoff 10 (notification preferences) and Handoff 12 (password
change) — a dedicated `/account` area consolidating both, plus a home for
a future payout-method/bank-reference display once Handoff 14's
`payoutReferenceMasked` field has a real value to show, would resolve
three handoffs' worth of the identical documented gap at once.

Whichever is chosen, keep `Product`/`SellerOffer`/`InventoryItem` strictly
separate (never collapse catalog identity, price, and stock back into one
model), keep "1 Checkout → N Orders" and "1 Order → N Fulfillments → N
Shipments" (schema-ready, MVP uses N=1) as the non-negotiable invariants,
keep PET LIFE OS's own inventory as the sole source of truth for stock
(never a marketplace), keep IRR as the only stored currency unit, keep
every financial write going through `LedgerService.recordBalanced()` or
its per-seller mirror `SellerLedgerService.recordBalanced()`, every
Fulfillment status change through
`FulfillmentTransitionService.transition()`, every inventory mutation
through `InventoryReservationService`/`InventoryMovementService`, every
seller balance mutation through `SellerLedgerService`'s sweep-flag
mechanism (never a stored, directly-editable balance column), and every
user-visible notification through
`NotificationOrchestratorService.notify()` — never a second write path
for any of them, no matter how small the change looks.

Alternatively, following directly from Handoff 16: **a household member
invite flow**, the feature this handoff's own `household.members.max`
entitlement is ready for but has no enforcement call site to attach to
today (`HouseholdsController` only supports household creation). Adding
`POST /households/:id/members` (invite/accept, reusing H12's own
identifier-based auth plumbing rather than inventing a new one) would let
`EntitlementService.assertWithinLimit(householdId, "household.members.max")`
gate it exactly the way `PetsService.create()` already gates `pets.max` —
no schema or entitlement-resolution change needed, the metering already
resolves correctly, only the missing feature and its one enforcement call
site. A related, smaller option: a proactive "renewal due soon" /
"trial ending soon" notification pass — `SubscriptionRenewalWorkerService`
currently only acts once a period has already ended; a scan that finds
subscriptions within N days of `currentPeriod.endAt`/`trialEndsAt` and
fires the two notification templates the spec names but this handoff
left unimplemented (see Known Limitations) would need no new
infrastructure beyond a second, similarly-shaped poller job. A third,
independent option: real proration — if the product later needs partial
credit on an upgrade mid-period, add it as deterministic integer-IRR
arithmetic with a full audit trail (a new `SubscriptionChange` note field
recording the computed credit), never floating point, keeping the
current no-proration path as the default for a downgrade (which must
never reduce paid entitlement mid-period regardless of how upgrade
proration is implemented).

Whichever is chosen, keep the Subscription/Payment/Entitlement separation
intact (a subscription's status is never inferred from a payment or
refund event), keep every subscription mutation going through
`SubscriptionService.lockAndGetCurrent()`'s lock-then-fresh-read pattern
(never a bare `getOrCreateRaw()` read followed by an unlocked write), keep
`EntitlementService` as the only place a feature checks a plan capability
(never a new `if plan.code === ...` check anywhere else), and keep every
subscription revenue/refund posting going through
`LedgerService.recordSubscriptionRevenue()`/`...Reversal()` — never a
second write path into `PLATFORM_REVENUE`.

Alternatively, following directly from Handoff 17: **a follow-up reminder
scan for `CarePlanItem`**, the same "reactive, not proactive" gap this
codebase now has in two places (Handoff 16's renewal reminders and
Handoff 17's `health.follow_up_due`) — a single new poller (the same
`setInterval`-class mechanism `NotificationDeliveryWorkerService`/
`SubscriptionRenewalWorkerService` already establish, not a new job-queue
dependency) that scans open `CarePlanItem` rows within N days of `dueAt`
would close both gaps as one small, reusable piece of infrastructure. A
related, smaller option: project a `CarePlanItem` of type `FOLLOW_UP` into
`CareCalendarEvent` the same way a confirmed `Booking` already does, so a
provider-issued follow-up appears directly on the owner's existing Care
Calendar rather than only in the Health Overview. A third, independent
option: a lightweight provider-side "verify this owner-uploaded document"
action — `MedicalDocument.verificationStatus` already models
`UNVERIFIED`/`PROVIDER_VERIFIED`, but nothing sets the latter today except
document creation itself; adding a real verify endpoint would need
`HealthDocumentsView`'s provenance badge (fixed this handoff to key off
`sourceType`, not `verificationStatus`) to stay on `sourceType` for
provenance while a separate, new UI affordance surfaces
`verificationStatus` for its own distinct meaning — keeping the two
concepts visually distinct is the one thing to get right before wiring it.

Whichever is chosen, keep `Booking`/`ClinicalVisit` strictly separate
(commercial/scheduling state vs. care-documentation state, never
collapsed), keep every provider-authored clinical record append/supersede/
void rather than edited in place, keep `canRecordClinicalData` as the only
authorization path for provider clinical authorship (never inferred from
org membership or booking category alone at the point of use), keep
`EntitlementService.assertWithinLimit()` off every provider-authored
creation path (never paywall safety-critical clinical content), and keep
private medical files behind `StorageService`'s signed-download flow —
never a stored public URL, no matter how small the change looks.
