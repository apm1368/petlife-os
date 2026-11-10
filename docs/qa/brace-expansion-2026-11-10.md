# QA-DEPS-BRACE-01 — compatible tooling patch

2026-11-10 UTC. Base `40f0045e5dbda0afd974779373fa3fd43d18be3b`; code/isolated retest `29fa9ce88e7311f2601092d444061a481077be0a`. **NOT LIVE; final workspace CI still required.** No application/schema/HERO/permission change.

## Observed dependency finding

Fresh lockfile registry audit reports `brace-expansion@5.0.9` through `packages/eslint-config → typescript-eslint → @typescript-eslint/typescript-estree → minimatch@10.2.6`. Two high recursion findings (audit IDs 1240107/1240111) and one moderate rewrite finding (1240103). This is observed tooling exposure, **not a demonstrated remote production API exploit**. Old generic notes saying every remaining advisory needs a major upgrade were too broad: this package has a same-major patch.

Pin only the installed v5 range to **5.0.12** via existing workspace overrides. Older v1/v2 consumers stay unchanged. Official npm version metadata confirms the same Node engine (`20 || >=22`) and balanced-match dependency range; locked balanced-match 4.0.4 is retained. Integrity comes from the official version metadata, not an invented checksum. Frozen offline lockfile validation with project pnpm 10.33.0 passes; no shared node_modules purge/install was performed.

## Verification

- Five Node contracts PASS against an explicitly isolated `/tmp` project with actual brace-expansion 5.0.12 and minimatch 10.2.6, installed using pnpm 10.33.0. No skips: pinned version/guards, ordinary lint glob/sequence/escaped behavior, tiny bounded nesting/rewrite options, bounded aggregate output and consuming minimatch glob matching.
- Adversarial fixtures are tiny and run in child processes capped at 64 MiB/1.5 seconds/64 KiB output; no production request, brute force or denial-of-service test. They verify new bounds, not a full historical exploit replay.
- CI executes the same script against the **actual eslint → parser → minimatch → brace** dependency path after frozen installation, without the local fixture-root environment variable. Local isolated package tests are not falsely described as a full current workspace install.
- Fresh `pnpm audit --prod --json`: **0 critical, 1 high, 6 moderate, 0 low**, versus prior 0/3/7/0. Audit exit remains nonzero because unresolved findings remain. Version metadata/lock consistency, Node syntax and diff checks PASS. No blanket security-ready claim.

The first isolated reinstall attempts stopped on fixture lock/config/no-TTY mismatches; only the final successful isolated install and five-test run are accepted evidence. The failed attempts did not touch shared workspace dependencies or active database volumes.

## Remaining risks / release

Zod remains the high advisory; file-type, next-intl, Nest core and minimatch remain moderate according to that registry snapshot. Their major-version/reachability work is separate. Do not force a global major override or mark them fixed. Dependabot is disabled; original memorial/CDN access and private production fixtures are still unavailable.

Fresh exact-head CI must pass before normal protected merge. GitHub requires branches up to date: update after preceding releases, inspect resulting diff and rerun rather than using admin/bypass. No migration; existing deployment backup/build rollback must remain intact. After deploy verify SHA/readiness and bounded public assets; audit remediation is lock/CI evidence, not production vulnerability exploitation. Keep real backup restore/dependency rollback drill explicitly unverified.
