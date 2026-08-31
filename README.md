# PET LIFE OS — Foundation

Coding Handoff 01: Foundation + Auth + Household + Pet Identity + Active Pet +
Onboarding + Basic Home. This is the first production-shaped slice of PET LIFE
OS — it proves **User → Household → Pet Identity → Active Pet → Personalized
Home** end to end, without prematurely building the rest of the product.

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
- `OnboardingModule` — resumable progress
- `HomeModule` — deterministic Home ranking
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
*preset* applied at grant time. The actual source of truth for "can this user
do X to this pet" is the `PetAccess` row — per-user, per-pet, independently
revocable/expirable, with a `source` (`HOUSEHOLD` | `MANUAL` | `TEMPORARY`).
This is why `PetAccessGuard` checks `PetAccess`, never `HouseholdMember.role`
directly.

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
| `User` | Identity (email/phone, locale, theme preference) |
| `Session` | Server-side session backing the cookie |
| `Household` | A home; `HouseholdMember` links users to it with a role preset |
| `Pet` | Identity, species/breed/sex/age, lifecycle status |
| `PetAccess` | The real per-user, per-pet permission grant (see above) |
| `ActivePetPreference` | Per-user, per-household "which pet is active" — never stored on `Pet` |
| `OnboardingProgress` | One row per user; chapter/step/status + completed steps, for resumability |
| `UserPetInterest` | Onboarding personalization input to the Home ranking service |
| `DomainEvent` | Outbox-shaped event log (`UserAuthenticated`, `PetCreated`, ...) |

All ids are UUIDs; all timestamps are UTC; weight is `Decimal`, never `float`;
money isn't modeled yet but `@petlife/types` already ships a `Money { amount,
currency }` shape for when it is.

### Home ranking (MVP)

`HomeRankingService` (`apps/api/src/modules/home/home-ranking.service.ts`) is
a pure function, deliberately not wired to any ML: given `hasActivePet`,
`healthBasicsComplete`, and the user's interests, it returns a primary action
and secondary actions. `HomeService` does the DB reads and calls it. This
split is what lets the ranking evolve later without touching data access.

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

GET    /households/:householdId/active-pet
PUT    /households/:householdId/active-pet

GET    /onboarding
PUT    /onboarding/progress
POST   /onboarding/complete                     (Idempotency-Key supported)

GET    /home

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
pnpm db:seed                     # Sarah + Luna (Golden Retriever) + Milo (DSH)

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
- **Frontend unit tests** (`apps/web/**/*.test.ts`, Vitest): locale/RTL
  config, theme persistence.
- **API e2e tests** (`apps/api/test/app.e2e-spec.ts`, Supertest against a
  real Nest app + Postgres + Redis): OTP → session, IDOR denial on a pet the
  user has no `PetAccess` grant for, household + pet creation with optional
  fields skipped, Luna→Milo active-pet switching reflected in `/home`,
  onboarding resume, and an idempotent pet-creation retry.

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

## What's implemented

Everything in the acceptance criteria of the coding handoff: Persian
(default, RTL) and English (LTR) locales; light/dark/system theme; dev-OTP
auth with resend cooldown, expiry, and attempt limiting; household creation;
pet creation with all optional fields skippable; resumable onboarding; a pet
automatically becoming Active Pet on first creation; My Pets with Active Pet
switching that updates Home without a reload; a minimal editable Pet Profile;
IDOR-safe authorization via `PetAccess`; unit + e2e tests for the critical
paths; a CI pipeline; and a documented local setup.

## Known limitations / deliberate simplifications

- **CSRF** uses the double-submit cookie pattern rather than a signed
  synchronizer token — adequate for this phase, revisit if a wider attack
  surface (e.g. subdomains) is introduced later.
- **Domain events** are outbox-shaped (a `domain_events` table with
  `processedAt`) but dispatched synchronously in-process via
  `EventEmitter2`, not by a separate relay/poller. No call site changes are
  needed to add one later.
- **Idempotency-Key** support is a Redis-cached-response strategy scoped to
  pet creation and onboarding completion, not a generic framework-level
  middleware.
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
- Full Health, AI, Vet marketplace, Commerce, Travel, Insurance, Community,
  Animal Support, and all Provider/Seller/Shelter/Admin surfaces are
  explicitly out of scope for this handoff, per the spec.

## Next recommended coding handoff

**Health Basics + Care Profile**, since Home's ranking already assumes a
"health basics complete" signal (`HomeRankingService`) that nothing populates
yet beyond weight/neutered-status on the Pet record itself. That handoff
would also be the natural place to introduce a real `HealthModule`, replace
the `/pets/active/health-setup` placeholder route, and start exercising the
`HEALTH` interest captured during onboarding personalization.
