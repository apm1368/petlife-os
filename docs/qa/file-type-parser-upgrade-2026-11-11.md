# Nest file-type parser upgrade QA — 2026-11-11

Status: `MERGED_AND_DEPLOYED`; PR #252 merged by squash at `80983a84ca0e3d35ddf4ca5d57f39ba16aad4205` and deployment run `43020269133` succeeded. Production version reports that SHA and deployment `github-43020269133-1`.

## Release verification — 2026-11-11

- PR #252 exact-head CI `43018809566` passed on `12a2900ed8e7bd3cb2ddfd1fabbde4f8d7566d69`; post-merge main CI and deployment `43020269133` passed.
- Fresh `pnpm audit --prod --audit-level=moderate` against the merged lockfile reports three moderate advisories (two next-intl, one Nest Core SSE) and no `file-type` or `minimatch` advisory. No malicious parser input or exploit was run.
- Safe production health and readiness return HTTP 200, deployed SHA matches main, database/Redis are up. No migration or public upload behavior changed. No production file upload was used as a smoke test.
- The two next-intl advisories and Nest SSE advisory remain listed, with applicability conditions not found in inspected routing/config/code. They are not claimed fixed or exploited.

## Baseline and finding

- Original finding baseline before PR #252: main `58abc32b0ff7b0c5978b652a953886dfce55301a`; production `5bd1b1e70cd71b53cf8c3ce87689194476187aca`. Current merged/deployed revision is recorded above.
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

- PR #252 source branch is `security/file-type-parser-upgrade`; implementation commit `16d36221ac90bae1c6af2f81f9a21c022774a326` contains both overrides and exact PR head is `12a2900…`. The deployed merge is `80983a84…`. No production parser endpoint was identified or called.
- This is a dependency remediation, not evidence that a crafted malicious archive or denial-of-service payload was reproduced.
