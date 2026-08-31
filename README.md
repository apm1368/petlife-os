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
- `HomeModule` — deterministic Home ranking, now permission-aware over health/care data
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
                                  # minimal care profile)

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
  surrounding page direction.
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
  left unanswered.

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
- Full Vet marketplace/booking, AI Health, Commerce, Travel, Insurance,
  Community, Animal Support, and all Provider/Seller/Shelter/Admin surfaces
  remain explicitly out of scope, per the spec.
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
- **No "invite a vet"/"grant temporary health access" endpoint** — the
  `canViewHealth`/`canEditHealth` flags are fully enforced, but the only way
  to grant them today is the existing `HOUSEHOLD`-sourced default at
  pet-creation time (same limitation the schema-hardening checkpoint already
  noted for `PetAccessGrant` generally).
- **Nutrition has no dedicated permission flag** — `/pets/:petId/nutrition`
  is gated by `canViewHealth`/`canEditHealth` since the spec didn't request a
  separate one; revisit if nutrition data ever needs a different audience
  than the rest of Health Basics.

## Next recommended coding handoff

**Vet Booking / Find-a-Vet basics.** `FIND_VET` has been a stubbed Home
action since Handoff 01 (`/vet/find`, a placeholder screen), Health Basics
now gives it something real to link from (a vet needs to see allergies,
active medications, and vaccination status before a visit), and the grant
model already anticipates it — `PetAccessSource.TEMPORARY` exists and is
enforced (see the schema-hardening checkpoint's expiry test) but has no
issuance API yet. That handoff would plausibly introduce a minimal
Provider/Clinic record, a booking request flow, and the first real use of a
short-lived `TEMPORARY` grant (e.g. "share Health Basics with this vet for
24 hours") — without yet building the full Provider/Seller marketplace,
which stays out of scope until its own handoff.
