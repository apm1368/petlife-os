# Zod validation hardening — 2026-11-11

Status: implemented and tested in an isolated branch; **not merged or live**.

## Baseline and finding

- Exact source: production `main` SHA `d2461e598fec4b18e7e4fc5f013b853d771ae02b`; isolated checkout under `/dev/shm`, pnpm 11.25.0, lockfile unchanged for the baseline audit.
- `pnpm audit --prod --audit-level=high` reported 1 high and 6 moderate advisories. The high finding is GHSA-mrhx-c7xc-m3w5: Zod 3.25.76 is vulnerable to memory exhaustion when a large array contains many invalid elements. `pnpm why zod --recursive` showed direct workspace paths through API, web, config, and shared validation.
- Source inspection found one shared `z.array()` request schema: onboarding interests, drawn from the eight-value `PetInterest` enum. The change caps that list at eight and upgrades the four workspace Zod dependencies to 4.6.7. This narrows input and removes the vulnerable Zod 3 dependency; no deliberate memory-exhaustion attempt was run and no exploit in production was reproduced.

## Remaining audit items

After the isolated Zod 4 update, the fresh audit reported 6 moderate advisories: two for `file-type` 20.4.1 through Nest common, two for `next-intl` 3.26.5, one for Nest core 10.4.22, and one for `minimatch` 10.2.6 through the ESLint/TypeScript-ESLint toolchain. These are not fixed by this change. The minimatch path is development tooling; the application-level applicability of the remaining advisories has not been reproduced or fully assessed. Do not describe the audit as clean.

## Validation on the isolated Zod 4 branch

- Fresh lockfile install: `pnpm install --frozen-lockfile --prefer-offline` passed.
- Focused regression: `pnpm --filter @petlife/api test --runInBand onboarding-validation.spec.ts` — 3 passed (all enum values accepted, oversized interests rejected, unknown values rejected).
- API unit suite: 59 suites / 342 tests passed; web suite: 316 files / 2,009 tests passed.
- API, web, config and validation TypeScript checks passed after running `pnpm --filter @petlife/api db:generate` in the isolated checkout. The first attempt before Prisma generation was invalid and is not counted.
- `pnpm lint` passed, including the design-system guard.
- `NEXT_PUBLIC_API_ORIGIN=http://localhost:4000 pnpm build` passed; the first build attempt without this required CI environment variable correctly failed fast. No database schema changed, so no migration is required for this slice.
- Post-upgrade `pnpm audit --prod --audit-level=high` no longer reported Zod; 6 moderate findings remain.

This evidence is source-specific to the unmerged trial. Exact-head hosted CI and normal protected integration are still required. No production config, transaction, user record, or provider integration was changed.
