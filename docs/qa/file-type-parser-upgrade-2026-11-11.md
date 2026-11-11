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

- PR #252 is on local/remote branch `security/file-type-parser-upgrade`, forked from `58abc32b0ff7b0c5978b652a953886dfce55301a`. Its current remote head before the documentation follow-up commit is `189fabe3543243ebb8ce6b45208125ba414f3647`; update this SHA after committing/pushing the follow-up.
- Hosted CI on `189fabe…` was still running when the follow-up added the minimatch override/docs; that run will be stale for the new commit. Check the new exact PR head CI before merge. After merge/deploy, verify SHA and readiness. No production parser endpoint was identified or called.
- This is a dependency remediation, not evidence that a crafted malicious archive or denial-of-service payload was reproduced.
