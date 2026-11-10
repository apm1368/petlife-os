# Local storage containment — 2026-11-10

## Scope and baseline

QA-STORAGE-01, P2: lexical sibling-prefix traversal in the **dev/test local driver** and its upload/download token handlers. Baseline `26a398eae70e02463f36bba57e3bd12480f0ed20`; fix/retest revision is the commit containing this record (see PR history). Relevant requirement: existing private-media/household isolation rules and final-batch-6 safe file-access checks. No schema, S3 policy, source-media, payment or landing HERO changes.

The old `normalize(join(base, key)).startsWith(base)` accepts `../storage-other/file` for `/tmp/storage`. The reproduction uses fabricated paths and disposable fixtures only; no customer file is read. This establishes a path-validation defect, **not** a demonstrated remote production exploit: callers generally generate keys server-side, token routes require Redis tokens, and `validateEnv` requires the S3 driver in production.

## Fix and evidence

Shared `resolveLocalStoragePath` uses absolute resolution and a path-component-relative boundary. Reject root/empty/NUL/absolute/outside keys, including prefix-sharing siblings. Apply at token issuance, both legacy token handlers and all local read/write/copy/delete operations. Invalid token keys return generic 404 without a file stream. Valid nested keys remain supported.

| Test | Environment/method | Expected/actual | Status |
| --- | --- | --- | --- |
| QA-STORAGE-01-A | Node/Jest; old check reproduction and invalid-key cases | Old prefix accepts sibling; new resolver rejects invalid keys | PASS |
| QA-STORAGE-01-B | Driver methods with mock Redis | Read/write/copy/delete/token issuance reject escaping keys; no token stored | PASS |
| QA-STORAGE-01-C | Actual upload/download controller methods with mock tokens/requests | Invalid legacy keys produce 404 before response/stream use | PASS |
| QA-STORAGE-01-D | `mkdtemp` fixture, real filesystem and read stream | Valid write/copy/read/delete; original fixture preserved | PASS |
| QA-STORAGE-01-E | Existing memorial/object-URL regressions | Opaque memorial copy and private namespace restrictions retained | PASS |
| QA-STORAGE-01-F | Fresh hosted full CI/build/migration/HTTP E2E | Required on final PR head | NOT_TESTED locally |
| QA-STORAGE-01-G | Production S3/CDN/direct source image/cache behavior | Requires authorized configuration/object-specific access | BLOCKED |

Command from `apps/api`: `jest --runInBand --runTestsByPath src/modules/storage/local-storage-path.spec.ts src/modules/storage/memorial-assets.spec.ts src/modules/storage/object-url.util.spec.ts` — **24 tests / 3 suites passed** on 2026-11-10 UTC. Focused ESLint and API TypeScript results are recorded in the PR. Browser/viewport not applicable to this backend-only change. New tests include handler-level denial, not a claim of fresh HTTP E2E or complete media-security coverage.

## Limitations and next action

- This resolver provides lexical containment, **not symlink isolation**. Local storage root must be service-controlled without untrusted symlinks; production must remain on S3. No permission changes or user-data deletion are performed.
- Existing original public-memory URLs and prior CDN copies are not revoked by memorial withdrawal. This fix does not change that fact. No verified bucket/CDN access is available in this workspace; existing deploy credentials are not exposed to the agent, and no new audit workflow has yet established read-only storage configuration evidence.
- Local disk: 160 MiB free before tests; dependencies are pre-existing. Fresh local full production build/DB E2E is capacity-blocked; hosted exact-head CI is the release gate.
- Payment worktrees and all pre-existing changes remain untouched. Keep status **AWAITING_CI_OR_MERGE / NOT LIVE** until protected merge and verified deployment. On release, reuse the web-only public evidence only after change-impact analysis; rerun release-critical health/version/readiness checks.
