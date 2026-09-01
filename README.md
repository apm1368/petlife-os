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
  tab switch, the Services active/disable toggle, and the Team roster.
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
  viewing provider's own `locale` (`fa` vs. `en`).

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

## Next recommended coding handoff

**Owner-visible provider communication + reviews basics.** The Provider OS
(Handoff 05) closed the loop on the provider side of a booking — confirm,
check in, start, complete, with a small owner-visible completion note —
but there is still no way for an owner to see anything beyond that one
note, and no way for either side to leave feedback. A minimal next step:
(1) a read-only "provider updates" feed on the owner's booking detail
page surfacing `BookingProviderNote`-adjacent, deliberately curated
owner-visible events (state transitions, the completion note) as a single
timeline rather than raw internal notes; (2) a simple post-completion
rating (1-5 stars + optional text) stored against the `Booking`, visible
on the provider's own profile as an aggregate — no moderation queue, no
photo attachments, no provider response threading yet. Both extend
`Booking` and reuse the existing owner/provider authorization boundaries
untouched; neither needs a new permission model or a second booking state
machine.

Alternatively, if the business prioritizes closing Provider OS gaps
instead: a real provider onboarding/verification workflow.
`ProviderVerificationStatus` has supported the full
`NOT_STARTED → SUBMITTED → UNDER_REVIEW → VERIFIED` vocabulary since
Handoff 03, but every provider in the system today reaches `VERIFIED`
only via `prisma/seed.ts` — there is no self-serve flow for a new
`ProviderOrganization` to register, submit for review, or move through
that state machine, and no admin-side review screen. This is a
substantial scope on its own (document upload, an admin review UI, an
applicant-facing status page) and should stay a dedicated handoff rather
than be folded into either the review/rating work above or a future
Provider OS enhancement pass. Whichever is chosen, keep `Booking` as the
sole source of truth for booking state, and `PetAccessGrant`/
`BookingPetAccess` as the only source of truth for pet-data access.
