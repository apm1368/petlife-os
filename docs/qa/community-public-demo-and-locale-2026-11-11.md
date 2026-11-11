# Community public-content and locale QA — 2026-11-11

## Summary

- Overall: `PARTIAL`. A production-facing community fixture leak and two locale-formatting defects were reproduced on deployed `5bd1b1e70cd71b53cf8c3ce87689194476187aca`.
- A local remediation and regression coverage are present in the associated PR. Production remains unchanged until that PR is merged/deployed and the live API/page is retested.
- Decision references: CM-01, CM-03, CM-04, CM-18; `docs/design/product-design-reference.md` public-content guidance. Demo/reference content is not evidence of actual community activity.

## Reproduction records

| Test ID | Environment / route | Role, browser, viewport, locale | Expected | Actual | Status on tested SHA | Evidence |
|---|---|---|---|---|---|---|
| COMM-PUB-001 | Production, deployed SHA `5bd1b1e70cd71b53cf8c3ce87689194476187aca`, `GET /api/community/posts?page=1&pageSize=2`, `/fa/community`, `/de/community` | Anonymous; Chromium 1440×1000 Persian and 390×844 German | Public feed contains only real published community content; fixture/seeding content is not exposed as genuine activity. | API returned `total: 14`; the leading records exactly matched `seed-sprint-demo-extras.ts` content explicitly marked “پست نمایشی”. The same posts rendered on the public German page. | `FAIL` before fix; a regression test was added but production is not yet retested. | Exact seed source in repository; temporary captures `/dev/shm/petlife-community-fa-desktop.png` and `/dev/shm/petlife-community-de-mobile.png` were inspected locally and intentionally not committed because they reproduce seeded names/content. |
| I18N-COMM-001 | Same production page, `/fa/community` | Anonymous; Chromium 1440×1000; Persian RTL | Zero counts render as localized numeric zero. | The first cards rendered `ناعدد نظر · ناعدد واکنش`; response counts were numeric zero. Cause: Persian digit strings were passed to ICU plural formatting. | `FAIL` before fix; component now passes numbers directly; focused web tests verify no `ناعدد`. Production not yet retested. | Same temporary Persian capture; web test `CommunityFeedView.test.tsx`. |
| I18N-COMM-002 | Same production page, `/de/community` | Anonymous; Chromium 390×844; German LTR | Dates follow locale conventions. | Date appeared as `5 Oktober`, omitting German punctuation; Spanish test expected `1 enero` rather than locale-standard `1 de enero`. | `FAIL` before fix; community date now uses locale-aware `Intl` formatting, with a fa Jalali regression assertion. Production not yet retested. | Temporary German capture; `CommunityFeedView.test.tsx`. |

## Fix and retest record

- API change: public list/count filters posts authored by reserved `@example.test` fixture accounts; public detail/comments return the normal not-found response; existing saved-post lists also omit fixture posts. Records are not deleted or modified. The filter uses the seed actor’s reserved test email domain; ordinary phone-only users and normal production email domains are not filtered.
- API regression: E2E test inserts one published `@example.test` fixture post, bookmarks it as a normal user, and asserts it is absent from the anonymous list, direct detail/comments return 404, and the user’s saved-post list omits it.
- UI change: keep counts numeric for ICU plural rules; use locale-aware Gregorian date formatting for en/de/es and the `fa-IR-u-ca-persian` Jalali calendar for Persian.
- Local tests on the working branch: `CommunityFeedView.test.tsx` — 24 passed; focused web ESLint passed; API service/E2E-file ESLint passed; after building shared config/types, API TypeScript check passed. `git diff --check` is required before push.
- API E2E was not run locally: no local PostgreSQL/Redis listener, Docker CLI, or `DATABASE_URL` is available. The regression test must pass in exact-head hosted CI before merge.
- Current production remains `5bd1b1e…` with the reproduced defect until merge/deploy. Do not mark this fix live based on local tests or an open PR.

## Remaining test and release actions

1. Verify exact PR CI, including the new API E2E regression and web test.
2. Merge only through the normal protected path after all required checks pass.
3. After authorized deployment, verify production SHA/readiness; request `/api/community/posts` and confirm seed fixture posts are excluded from both `items` and `total`, direct fixture detail returns 404, normal public posts remain visible where real records exist, and Persian count/date rendering no longer shows NaN.
4. The current production corpus appears to be entirely seeded demo data; filtering can make the public feed empty. Do not re-enable fixtures or manufacture replacement posts. Real community content availability remains a separate product/data dependency.

