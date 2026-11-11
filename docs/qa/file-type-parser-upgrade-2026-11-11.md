# Nest file-type parser upgrade QA — 2026-11-11

Status: `OPEN_PR / AWAITING_CI_OR_MERGE`; PR #252 includes this parser change plus a compatible development-tooling minimatch override. Nothing from #252 is deployed.

## Baseline and finding

- Baseline branch: current `main` `58abc32b0ff7b0c5978b652a953886dfce55301a` (after docs PR #250 merged); production is still `5bd1b1e70cd71b53cf8c3ce87689194476187aca`.
- The fresh production dependency audit identified two moderate advisories for `file-type@20.4.1`, resolved through `@nestjs/common@10.4.22`.
- Nest's built-in `FileTypeValidator` dynamically imports `file-type`. Source search did not find application use of that validator, so application exploitability was not established. The parser is nevertheless present in a framework path and can be safely pinned to its patched release.
- Applicable fix releases: `file-type >=21.3.1` for the parser loop advisory and `>=21.3.2` for the ZIP decompression-bomb advisory. The repository runtime requirement is Node `>=20`, matching `file-type@21.3.2`'s engine requirement.

## Change and evidence

- Workspace override pins `file-type@<21.3.2` to `21.3.2`, matching in `pnpm-lock.yaml`.
- The same PR adds `minimatch@>=7 <11.0.1` → `11.0.1` to clear the tooling-only GHSA without altering legacy v3 consumers. Fresh audit now reports three moderate advisories (two next-intl and one Nest SSE); see [dependency audit](dependency-audit-2026-11-11.md).
- No upload route, accepted file type, maximum size, or validation rule was loosened. No schema/migration or production data changed.
- `pnpm --filter @petlife/api exec jest --runInBand --runTestsByPath src/common/parser-compatibility.spec.ts`: **6 passed**, including a real Node subprocess verifying Nest accepts a tiny valid PNG and rejects invalid bytes while resolving the patched parser.
- `pnpm --filter @petlife/api exec eslint src/common/parser-compatibility.spec.ts`: passed.
- `pnpm --filter @petlife/api typecheck`: passed.
- `pnpm --filter @petlife/api build`: passed.
- `pnpm --filter @petlife/api lint`: passed.
- Full monorepo `pnpm lint`: passed after both overrides.
- Full monorepo `pnpm typecheck`: passed after both overrides.
- `corepack pnpm@10.33.0 install --lockfile-only --frozen-lockfile`: passed (the repository-pinned pnpm version); full local dependency installation was done with pnpm 11.25.0 from the already preserved cache.
- Fresh `pnpm audit --prod --audit-level=moderate` after both lock updates reports **three** moderate advisories and no `file-type` or `minimatch` advisory. The remaining package findings are two `next-intl` and one Nest core SSE; those are not claimed fixed by this patch.
- `git diff --check`: passed.

## Limits and release actions

- PR #252 is on branch `security/file-type-parser-upgrade`. Implementation commit `16d36221ac90bae1c6af2f81f9a21c022774a326` contains both overrides; merge commit `d6a0cdf71b8509ec83f924eafcdb4d1fb772c9dc` integrates latest main `b7055bd…` including the independent #251 fix. PR metadata is authoritative for the newest handoff-only head.
- Hosted CI success on prior head `189fabe…` is stale; CI on `16d3622…` was in progress and is also stale after the main-merge commit. Check the exact current PR head CI before merge. After merge/deploy, verify SHA and readiness. No production parser endpoint was identified or called.
- This is a dependency remediation, not evidence that a crafted malicious archive or denial-of-service payload was reproduced.
