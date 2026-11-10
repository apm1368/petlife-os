# Compatible dependency hardening — 2026-11-10 UTC

QA-DEPS-02: final-batch-6 security maintenance. [Structured evidence and limitations](security-compatible-transitives-2026-11-10.json). Baseline main `0db2284b59f1926f29b28a43f1f5bd7fcc7272b3`; exact retest SHA is the final PR/CI head, not an older successful run.

## Change and rationale

Pin six vulnerable transitive families to patched versions **within their existing major** using the existing workspace override mechanism: body-parser 1.20.9, qs 6.16.1, Multer 2.5.0, PostCSS 8.5.26, source-map-js 1.2.2 and Lodash 4.18.1. Prior proxy-addr fix is retained. Versions/advisory patched ranges were read from the registry, not guessed. The new lockfile adds only four package-version keys; PostCSS/Lodash converge to already locked safe versions. Removed obsolete leaves and regenerated optional peer contexts account for the larger mechanical lock diff. No Nest, next-intl, Zod, React or Next major upgrade.

`pnpm audit --prod --json` changes from **0 critical / 15 high / 15 moderate / 2 low** to **0 / 3 / 7 / 0**. This is package advisory evidence, not observed exploitability or perfect security. Remaining file-type, next-intl, Nest, brace-expansion, Zod and minimatch findings are unresolved. Existing upload routes do not currently use a Multer FileInterceptor; do not claim a reachable Multer exploit was reproduced.

## Tests and release gate

New `apps/api/src/common/parser-compatibility.spec.ts` resolves the exact parsers installed beneath Nest rather than introducing test-only direct dependencies. It requires patched versions and exercises actual isolated HTTP JSON/form/multipart behavior and small payload limits, including a gzip decoded-size limit. No customer data, DB, external API, real charge or stress test.

Four behavior cases pass on the **old reused local dependency tree**, focused ESLint passes. The package-version assertion is not reported as locally passed: new packages were not installed locally. All five tests are committed without skips and must pass in **fresh hosted final-head CI**, alongside full API/web tests, TypeScript, migrations and production build. The first compressed-body fixture failed (400) because the test client encoded the Buffer as JSON; raw Node HTTP bytes corrected the fixture and the expected 413 passes. No application check was weakened.

No schema migration or product behavior/UI translation change; HERO untouched. Before release use the normal backup/rollback process, verify the exact tested merged revision, then run bounded health/readiness/version and public browser/API smoke. Dependency-tree rollback across releases has not been drilled in this environment. **AWAITING_CI_OR_MERGE / NOT LIVE** until that evidence exists.

Disk dropped from ~160 MiB to 4.4 MiB during lockfile metadata resolution. Only the confirmed unused/untracked project `.next` (44 MiB) was removed after checking no Next process was using it; free space recovered to ~49 MiB. It can be regenerated, but fresh full local build/DB tests remain capacity-blocked. No source, Git history, uncommitted work, payment worktree or DB volume was deleted. Continue isolated/hosted checks; do not perform broad cache/volume cleanup.
