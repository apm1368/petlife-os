# QA-COMMUNITY-RACE-01 — obsolete feed requests, 2026-11-10 UTC

**P2, reproduced and fixed locally; NOT LIVE.** Requirements: CM-02 feed filtering, M-08 moderation preserved, GC-09/GC-10 language/RTL rules and owner's retry/stale-state QA. Source baseline `1a5b2c3b8d14615b18fdd613e6b0956d6fe9a31b`; fix/test code `c5865f9a0d6894e02159a291d0005fdd4c414de3`. Shared-state/error patterns are consistent with design reference 15; no layout/token/HERO changes or claim of rendered visual completion.

## Reproduction

Isolated React/Vitest environment, real fa/en/de/es catalogs, synthetic published post fixtures only; no production records/requests. Deferred service promises reproduce out-of-order GET completion without depending on network timing:

1. Load initial posts, select Question, then General before Question completes.
2. Resolve General, then resolve Question: the old response replaces current General posts (FAIL).
3. Alternatively reject old Question after General succeeds: obsolete error hides current results (FAIL).
4. Resolve older request while current request remains pending: loading disappears early (FAIL).

Initial run: **3 failed / 13 passed**, all three new regressions fail on baseline. An old pagination response can likewise append posts into a new topic; a further regression covers that case. This is incorrect UI filtering/loading/recovery, not demonstrated cross-user data exposure or moderation bypass.

## Fix and retest

Each request captures an increasing sequence. Only the newest may update posts/page number/error/loading. Effect cleanup invalidates pending results on unmount and React Strict Mode cleanup. HTTP requests are not claimed aborted; late results are ignored. Current failures still use the existing localized retry. No API/authorization/query/publication contract changes, no new translations of authored content.

Focused command from `apps/web`:

```sh
vitest run features/community/CommunityFeedView.test.tsx features/community/CommunityPostDetailView.test.tsx features/community/chat/ChatViews.test.tsx
eslint features/community/CommunityFeedView.tsx features/community/CommunityFeedView.test.tsx
tsc --noEmit --incremental false
```

**3 suites / 42 tests PASS**, ESLint and web TypeScript PASS, diff check PASS. The newest-topic regression uses all four real catalogs; original authored fixture content remains unchanged. Stale error/loading/pagination cases and existing localized empty/error/retry/pagination/detail/chat regressions pass. This is not a production race retest, full-page browser/localization proof, concurrency security certification or complete community acceptance.

## Integration / next action

Independent branch from current main; #217 is a CSS/wrapper design slice on the same component and must preserve this request-order logic when integrating. Neither requires merging the other first. Fresh exact-head CI/build/E2E is required. No schema migration/financial transaction. After protected merge and authorized deployment, verify exact SHA/readiness, bounded public assets and public community filters without publishing posts; exercise adversarial response ordering only in isolated fixtures. Mark LIVE_VERIFIED only after actual relevant release verification. Private messages, moderation and admin workflows remain separately tested/partial according to their records.
