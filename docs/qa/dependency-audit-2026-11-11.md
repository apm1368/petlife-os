# Dependency audit and applicability review — 2026-11-11

Status: `PARTIAL`. A follow-up remediation is in open PR #252; the fresh audit on its working tree reports three moderate advisories remaining. This is a source/configuration applicability review, not an exploit test or formal security assessment.

## Follow-up remediation — 2026-11-11

- PR #252 (head before this follow-up: `189fabe3543243ebb8ce6b45208125ba414f3647`; a new commit will update this record) pins Nest's transitive `file-type` to `21.3.2`, which clears the two file-type advisories from a fresh audit. A native-Node regression exercises Nest's dynamic magic-number validator against one valid PNG and invalid bytes.
- The same isolated candidate pins vulnerable development-tooling `minimatch` versions `>=7 <11.0.1` to `11.0.1`. This keeps older `minimatch@3` consumers on their existing major while moving the affected ESLint/TypeScript-ESLint path to the advisory's fixed release. The lockfile resolves two versions, and a fresh audit no longer reports `minimatch`.
- After both overrides, `pnpm audit --prod --audit-level=moderate` reports **three** moderate package advisories: two `next-intl` and one Nest SSE. Their source/configuration limitations below are unchanged. No exploit was reproduced.
- Compatibility checks after the overrides: full monorepo `pnpm lint` passed; full monorepo `pnpm typecheck` passed; API unit test suite passed (61 suites / 347 tests); focused Nest parser test passed (6 tests); API build passed. The production web build is left to exact-head CI because disk is constrained.
- Current candidate source branch is `security/file-type-parser-upgrade`, PR #252. Hosted CI was running on its earlier head `189fabe…` when this follow-up was authored; the branch must be pushed, its new exact-head CI must pass, and the final PR must be merged/deployed before calling either advisory fixed in main/production.

## Scope and method

- Dependency state: merged lockfile from PR #248, deployed in main descendant `9da443e619a44d068c83449a8c33f1e11e9ffcbc`; audit was run in a disposable `/dev/shm` checkout with the reproducible frozen pnpm install. Package manager reported by the workspace: pnpm 11.25.0.
- Command: `pnpm audit --prod --audit-level=moderate`.
- Dependency graph/source checks: `pnpm why` and repository search for affected API use/configuration. No exploit payloads were executed.
- The audit is package advisory output. “Not currently applicable” below means the triggering feature/configuration was not found in inspected application code; it does not mean the upstream vulnerable version is fixed.

## Results

| Package/path | Advisory / reported condition | Source/configuration assessment | Status and next action |
|---|---|---|---|
| `file-type@20.4.1` via `@nestjs/common` (fixed in PR #252 candidate) | GHSA-5v7r-6r5c-r473: crafted short input can cause an infinite loop; fixed upstream at `>=21.3.1`. | Nest dynamically imports the parser in its `FileTypeValidator`; source search did not find application use of that built-in validator. A compatibility test exercises valid/invalid buffer parsing, not a hostile exploit. | `CANDIDATE FIX / awaiting exact-head CI, merge and deployment`. Keep pending until the fixed lockfile is deployed; then rerun audit. |
| `file-type@20.4.1` via `@nestjs/common` (fixed in PR #252 candidate) | GHSA-j47w-4g3g-c36v: ZIP decompression bomb; fixed upstream at `>=21.3.2`. | Same dependency path; no archive exploit or production impact was tested. | `CANDIDATE FIX / awaiting exact-head CI, merge and deployment`. Do not call exploitability reproduced. |
| `next-intl@3.26.5` | GHSA-8f24-v5vv-gm5j: open redirect requires affected locale routing configuration; fixed upstream at `>=4.9.1`. | `apps/web/middleware.ts` configures `localePrefix: "always"`, not the advisory’s `as-needed` condition. No matching vulnerable configuration was found in the inspected route. | `PACKAGE ADVISORY OPEN / stated trigger not found`. Keep configuration test; assess next-intl v4 migration separately before upgrading. |
| `next-intl@3.26.5` | GHSA-4c35-wcg5-mm9h: prototype pollution requires `experimental.messages.precompile: true` and attacker-controlled message catalog keys; fixed upstream at `>=4.9.1`. | `apps/web/next.config.mjs` does not enable that option. `apps/web/lib/i18n/request.ts` loads repository-owned JSON catalogs. No attacker-controlled catalog key path was found. | `PACKAGE ADVISORY OPEN / stated conditions not found`. Reassess if dynamic/untrusted catalogs or precompilation are introduced; plan a major upgrade independently. |
| `@nestjs/core@10.4.22` | GHSA-36xv-jgw5-4q75: `SseStream._transform()` may inject SSE fields if developer-controlled `message.type` or `message.id` includes CR/LF; fixed at `>=11.1.18`. Exploitation requires user-influenced values to be mapped into these fields. | Search found no `@Sse`, `SseStream`, `MessageEvent`, or SSE endpoint use. | `PACKAGE ADVISORY OPEN / affected feature not found`. Reassess before adding SSE or upgrading Nest major. |
| `minimatch@10.2.6` via TypeScript-ESLint/ESLint tooling (fixed in PR #252 candidate) | GHSA-g3hv-75wg-m249: globparts amplification DoS; fixed at `>=11.0.1`. | Development-tooling path only; source search found no application runtime use. The prior 10.2.7 trial was not available in the registry. Candidate override changes affected `>=7` consumers to 11.0.1 while leaving old v3 consumers unchanged. Full monorepo lint/typecheck passed; audit no longer reports minimatch. | `DEV-TOOLING CANDIDATE FIX / awaiting exact-head CI, merge and deployment`. No runtime exploit was reproduced. |

## Fixed in this batch

- Prior high advisory GHSA-mrhx-c7xc-m3w5 in Zod 3 was removed from the merged lockfile by PR #248, which upgrades workspace Zod to 4.6.7 and bounds the onboarding interest array. Exact-head CI run `43000952182` passed; main commit is `9da443e619a44d068c83449a8c33f1e11e9ffcbc`; deployment run `43003165980` succeeded and production version reported that SHA at 2026-11-11 11:00 UTC.
- Focused onboarding schema tests (3), API unit tests (59 suites / 342 tests), web unit tests (316 files / 2,009 tests), API/web/config/validation typechecks, lint and production build passed on the isolated branch before merge. Hosted exact-head CI passed after integration. These tests establish regression/build behavior, not exploitability or production endpoint semantics.
- No database migration was added. No security advisory is claimed fixed solely because a package version differs; the six moderate findings remain in the current package audit.

## Limits and next actions

- The remaining three moderate findings are `next-intl` (two advisories) and Nest core SSE (one advisory). `next-intl`/Nest major migrations remain separate; no exploit was reproduced. Reassess if vulnerable configuration or SSE behavior is introduced.
- The advisory assessment used lockfile paths and current source/configuration inspection; it did not include a formal penetration test, hostile archive corpus, or production private-role testing.
- Rerun this audit after dependency, lockfile, runtime, or configuration changes. Do not reuse this assessment if the affected features/configuration change.

