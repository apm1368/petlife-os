# Nest file-type parser upgrade QA — 2026-11-11

Status: `IMPLEMENTED_LOCALLY / AWAITING_CI_OR_MERGE`; this is not deployed.

## Baseline and finding

- Baseline branch: current `main` `58abc32b0ff7b0c5978b652a953886dfce55301a` (after docs PR #250 merged); production is still `5bd1b1e70cd71b53cf8c3ce87689194476187aca`.
- The fresh production dependency audit identified two moderate advisories for `file-type@20.4.1`, resolved through `@nestjs/common@10.4.22`.
- Nest's built-in `FileTypeValidator` dynamically imports `file-type`. Source search did not find application use of that validator, so application exploitability was not established. The parser is nevertheless present in a framework path and can be safely pinned to its patched release.
- Applicable fix releases: `file-type >=21.3.1` for the parser loop advisory and `>=21.3.2` for the ZIP decompression-bomb advisory. The repository runtime requirement is Node `>=20`, matching `file-type@21.3.2`'s engine requirement.

## Change and evidence

- Workspace override pins `file-type@<21.3.2` to `21.3.2`, matching in `pnpm-lock.yaml`.
- No upload route, accepted file type, maximum size, or validation rule was loosened. No schema/migration or production data changed.
- `pnpm --filter @petlife/api exec jest --runInBand --runTestsByPath src/common/parser-compatibility.spec.ts`: **6 passed**, including a real Node subprocess verifying Nest accepts a tiny valid PNG and rejects invalid bytes while resolving the patched parser.
- `pnpm --filter @petlife/api exec eslint src/common/parser-compatibility.spec.ts`: passed.
- `pnpm --filter @petlife/api typecheck`: passed.
- `pnpm --filter @petlife/api build`: passed.
- `pnpm --filter @petlife/api lint`: passed.
- `corepack pnpm@10.33.0 install --lockfile-only --frozen-lockfile`: passed (the repository-pinned pnpm version); full local dependency installation was done with pnpm 11.25.0 from the already preserved cache.
- Fresh `pnpm audit --prod --audit-level=moderate` after the lock update reports **four** moderate advisories and no `file-type` advisories. The four remaining package findings are two `next-intl`, one Nest core SSE, and development-only `minimatch`; see [dependency audit](dependency-audit-2026-11-11.md). Those are not claimed fixed by this patch.
- `git diff --check`: passed.

## Limits and release actions

- Exact source SHA: local branch `security/file-type-parser-upgrade` forked from `58abc32b0ff7b0c5978b652a953886dfce55301a`; record its final commit SHA after commit/PR creation.
- Hosted CI, PR merge and production deployment have not yet occurred. Re-run/check the exact final PR head before merge; after deploy, verify SHA and readiness. No production parser endpoint was identified or called.
- This is a dependency remediation, not evidence that a crafted malicious archive or denial-of-service payload was reproduced.
