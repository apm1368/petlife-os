# PET LIFE OS progress handoff — 2026-11-07

This checkpoint is factual as of 2026-11-07. It is not a completion or production-readiness claim.

## Git and production

- `origin/main`: `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`.
- `https://opetlife.ir/api/health/version` reports the same SHA, environment `production`,
  deployment `github-42091865674-1`. No newer release was verified.
- Current implementation branch: `feat/public-pet-memorial`, based on the above main SHA.
- The current branch contains the public memorial implementation and the photo privacy fix;
  PR #117 targets `main`, head `a3e398e09d7da6784b73b964690eced52926c5ca`. GitHub CI run
  42335798635 passed all steps, including migrations, tests, API E2E and build. Review is
  required. It is not deployed or LIVE_VERIFIED.
- Payment-control work remains in a separate dirty worktree at
  `/workspace/petlife-payment-controls-live`; preserve its four modified files and two new
  service/spec files. Other known dirty worktrees: `/workspace/petlife-phase-zero-audit` and
  `/workspace/petlife-pr110-111-check`. Do not reset, clean or overwrite them.
- Disk was 98% full with about 679 MB free at the last check. No cleanup was performed.

## Review queue

All listed open PRs require human review or are dependency-blocked. Do not bypass protection.

| PR | Base | Current status / next action |
| --- | --- | --- |
| #107 demo-data removal | `main` | CI green; `REVIEW_REQUIRED`; confirmed live exposure below, highest launch priority. |
| #112 owner decisions/design reference | `main` | CI green; `REVIEW_REQUIRED`; source decisions for PL-09/PL-10 and languages. |
| #113 catalog/accommodation framework | `main` | CI green; `REVIEW_REQUIRED`; description corrected to state Jajiga is selected by PL-10 in #112. |
| #114 Jajiga/seller catalog | #113 | dependency on #113; retarget to main, inspect diff and rerun relevant tests only after #113 merges. |
| #110 phone-first signup/Help/legal | `main` | CI green; `REVIEW_REQUIRED`. |
| #111 household invitations/multi-pet | #110 head (`codex/finalize-support`) | dependent on #110; retarget and rerun signup/household/permission/booking checks after #110 merges. |
| #115 simple display mode | `main` | latest checked run 42274224922 succeeded; `REVIEW_REQUIRED`. |
| #116 public landing articles | `main` | latest checked run 42273854807 succeeded; `REVIEW_REQUIRED`. |
| #117 consented public memorial workflow | `main` | run 42280222282 passed all checks; `REVIEW_REQUIRED`. |
| #108 PY-19 reconciliation | `main` | `REVIEW_REQUIRED`. |
| #109 admin role builder | `main` | `REVIEW_REQUIRED`. |
| #102–106 | `main` | `REVIEW_REQUIRED`; review individually for decision coverage/dependencies. |
| #59 | `main` | `DIRTY`, `REVIEW_REQUIRED`; do not merge without conflict review. |

The PR checks above are point-in-time checks from 2026-11-06. Requery before any merge.

## Current independent implementation: public memorial workflow

- Branch: `feat/public-pet-memorial`.
- Existing decision implemented: U-02, with relevant PL-05 landing memorial and PL-04 unchanged HERO.
- Added explicit owner consent, owner-only submit/withdraw, lifecycle checks, image selection,
  Trust & Safety moderation, database append-only audit events, admin audit log, public data
  minimization and a landing carousel with loading/empty/error/reduced-motion behavior.
- No private memory is made public; only already-public, non-archived pet photos may be selected.
- No live or production verification. Do not apply the migration in production until review,
  CI, backup/rollback readiness, and authorized deployment are confirmed.
- Design detail and known limitation: `docs/product/public-pet-memorial-workflow.md`.

### Checks performed

- Fresh DB E2E affected file: 23/23 passed, including consent, owner withdrawal, rejection,
  non-owner denial, role permission denial, stale/archived image rejection, public response
  minimization, opaque image alias invalidation, and append-only audit enforcement.
- Web typecheck and three focused test files: passed (14 tests).
- API typecheck, changed-file ESLint, Prisma schema validation, migration application through
  disposable `test:e2e:fresh`, and `git diff --check`: passed.
- `fa.json` / `en.json` parse; no German/Spanish catalogs currently exist in main.
- The public image endpoint now streams bytes through the API, returns no `Location` header,
  and sets browser/CDN/surrogate `no-store` directives. Its response and application warning
  contain no pet/household ID or storage key. Each image request rechecks publication and
  withdrawal, so pending, rejected, withdrawn and unknown submissions return 404.
- The legacy source image remains in the already-public pet-memory storage namespace and its
  internal object key remains pet-scoped. The memorial list and image response no longer disclose
  that key; no source-image rekeying or production cache purge has been performed.

## External source evidence and status

- Jajiga is the owner-selected source; do not reopen the comparison. Earlier pilot: six
  candidates observed on one page, zero imported. No nationwide coverage, date prices, live
  availability or detailed pet-policy coverage demonstrated.
- Digikala prior pilot: zero products; the observed route was a shell and tested product paths
  were disallowed by robots policy. Do not bypass controls or claim a live importer.
- No external connector is marked production-ready or `LIVE_VERIFIED`.

## Production defect confirmed

- Read-only `GET https://opetlife.ir/api/shop/products?page=1&pageSize=50` returned 15 public
  product items. Ten have reserved `qa-b4-*` fixture slugs and Persian titles marked
  `(نمایشی)`; their offers are also labelled `(نمایشی)`. The other five include seeded
  product fixtures. This confirms #107 remains a real launch issue, not merely a report.
- #107 is CI-green but `REVIEW_REQUIRED`; no policy bypass or production database write was
  attempted. It cannot be released until authorized review/merge and pipeline deployment.

## Latest live verification — 2026-11-07

- `GET /api/health/version` still reports `3ed6c598e92061a40a3e28e1cd48fb4cbef71a41`
  (`github-42091865674-1`).
- `GET /api/shop/products?page=1&pageSize=50` still returns 15 products, including all ten
  `qa-b4-*` records listed in the previous section. #107 remains `REVIEW_REQUIRED`; CI run
  42231686406 passed. No production writes were made.
- PRs #107, #112, #113, #115, #116 and #117 report green CI and `REVIEW_REQUIRED`. #114 is
  green but based on #113. #110 is green and requires review; #111 is based on #110's branch.
  No merge or deployment was performed.
- Required docs source `docs/design/product-design-reference.md` is absent on this branch;
  the available design source is `docs/design/README.md` with its preserved visual-reference set.

## Next actions

1. Await required human review on #117. Latest code head `a3e398e`; full CI run 42335798635 passed.
2. Recheck #115/#116 checks and request/await authorized reviews; they were green on the latest
   checked runs but remain blocked by required review.
3. Keep #107 at top of review queue. No production switch/deploy is authorized through bypass.
4. After #110/#113 merge, retarget dependent PRs #111/#114, inspect their new diffs and rerun
   the listed domain tests before considering merge.
5. Recheck production SHA after any approved deployment; only then verify released flows.
