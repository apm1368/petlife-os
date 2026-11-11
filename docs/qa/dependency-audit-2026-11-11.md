# Dependency audit and applicability review — 2026-11-11

Status: `PARTIAL`. A fresh production dependency audit is recorded after the Zod update. The audit still reports six moderate advisories. This is a source/configuration applicability review, not an exploit test or formal security assessment.

## Scope and method

- Dependency state: merged lockfile from PR #248, deployed in main descendant `9da443e619a44d068c83449a8c33f1e11e9ffcbc`; audit was run in a disposable `/dev/shm` checkout with the reproducible frozen pnpm install. Package manager reported by the workspace: pnpm 11.25.0.
- Command: `pnpm audit --prod --audit-level=moderate`.
- Dependency graph/source checks: `pnpm why` and repository search for affected API use/configuration. No exploit payloads were executed.
- The audit is package advisory output. “Not currently applicable” below means the triggering feature/configuration was not found in inspected application code; it does not mean the upstream vulnerable version is fixed.

## Results

| Package/path | Advisory / reported condition | Source/configuration assessment | Status and next action |
|---|---|---|---|
| `file-type@20.4.1` via `@nestjs/common` | GHSA-5v7r-6r5c-r473: crafted short input can cause an infinite loop; fixed upstream at `>=21.3.1`. | Dependency is present. No crafted input was tested. Upgrading the framework-transitive dependency independently may be incompatible; no safe supported override has been verified. | `OPEN / applicability not reproduced`. Evaluate a coordinated Nest/file-type upgrade in an isolated branch and run upload/parser tests. |
| `file-type@20.4.1` via `@nestjs/common` | GHSA-j47w-4g3g-c36v: ZIP decompression bomb; fixed upstream at `>=21.3.2`. | Dependency is present. No archive exploit or production impact was tested. | `OPEN / applicability not reproduced`. Same coordinated upgrade and archive-limit test action as above. |
| `next-intl@3.26.5` | GHSA-8f24-v5vv-gm5j: open redirect requires affected locale routing configuration; fixed upstream at `>=4.9.1`. | `apps/web/middleware.ts` configures `localePrefix: "always"`, not the advisory’s `as-needed` condition. No matching vulnerable configuration was found in the inspected route. | `PACKAGE ADVISORY OPEN / stated trigger not found`. Keep configuration test; assess next-intl v4 migration separately before upgrading. |
| `next-intl@3.26.5` | GHSA-4c35-wcg5-mm9h: prototype pollution requires `experimental.messages.precompile: true` and attacker-controlled message catalog keys; fixed upstream at `>=4.9.1`. | `apps/web/next.config.mjs` does not enable that option. `apps/web/lib/i18n/request.ts` loads repository-owned JSON catalogs. No attacker-controlled catalog key path was found. | `PACKAGE ADVISORY OPEN / stated conditions not found`. Reassess if dynamic/untrusted catalogs or precompilation are introduced; plan a major upgrade independently. |
| `@nestjs/core@10.4.22` | GHSA-36xv-jgw5-4q75: `SseStream._transform()` may inject SSE fields if developer-controlled `message.type` or `message.id` includes CR/LF; fixed at `>=11.1.18`. Exploitation requires user-influenced values to be mapped into these fields. | Search found no `@Sse`, `SseStream`, `MessageEvent`, or SSE endpoint use. | `PACKAGE ADVISORY OPEN / affected feature not found`. Reassess before adding SSE or upgrading Nest major. |
| `minimatch@10.2.6` via TypeScript-ESLint/ESLint tooling | GHSA-g3hv-75wg-m249: globparts amplification DoS; current advisory metadata says fixed at `>=11.0.1`. | Resolved through development lint tooling, not a runtime application path; source search found no application minimatch usage. No untrusted runtime glob path was identified. A trial lockfile-only override to 10.2.7 failed with `ERR_PNPM_NO_MATCHING_VERSION`; that version is not published. Registry query showed 11.0.8 as newest, but the fixed version is a major upgrade. The attempted override was removed and no lockfile change was retained. | `DEV-TOOLING ADVISORY OPEN / runtime exposure not found / fix requires major dependency upgrade`. Reassess compatibility before updating TypeScript-ESLint tooling. |

## Fixed in this batch

- Prior high advisory GHSA-mrhx-c7xc-m3w5 in Zod 3 was removed from the merged lockfile by PR #248, which upgrades workspace Zod to 4.6.7 and bounds the onboarding interest array. Exact-head CI run `43000952182` passed; main commit is `9da443e619a44d068c83449a8c33f1e11e9ffcbc`; deployment run `43003165980` succeeded and production version reported that SHA at 2026-11-11 11:00 UTC.
- Focused onboarding schema tests (3), API unit tests (59 suites / 342 tests), web unit tests (316 files / 2,009 tests), API/web/config/validation typechecks, lint and production build passed on the isolated branch before merge. Hosted exact-head CI passed after integration. These tests establish regression/build behavior, not exploitability or production endpoint semantics.
- No database migration was added. No security advisory is claimed fixed solely because a package version differs; the six moderate findings remain in the current package audit.

## Limits and next actions

- No package-level upgrade for the six moderate findings is included in this change. `file-type` and Nest upgrades cross framework dependency boundaries; `next-intl` and Nest fixes currently imply major-version migrations. Validate compatibility and upload/locale/SSE regression behavior before updating.
- The advisory assessment used lockfile paths and current source/configuration inspection; it did not include a formal penetration test, hostile archive corpus, or production private-role testing.
- Rerun this audit after dependency, lockfile, runtime, or configuration changes. Do not reuse this assessment if the affected features/configuration change.

