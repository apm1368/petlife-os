# Public Help, legal and status interface — 2026-11-10 UTC

QA-HELP-LOCALE-01, P1 for whole-page language requirement (GC-09/GC-10, AD-04/05/07–11 and existing legal-publication rules). Baseline main `0db2284b59f1926f29b28a43f1f5bd7fcc7272b3`. Fix SHA is the final commit/PR containing this record; exact hosted checks are required. Reference 15 supplies form/state/focus/RTL-LTR patterns. HERO source/image/composition untouched.

## Reproduction and scope

The production `/de/legal` heading/subtitle are English (`Policies and legal documents`, `Only published versions are shown here`). The source shared `PublicHelpViews.tsx` selects only fa versus English throughout help/legal/status. This is application UI fallback, not source-authored policy text. Screenshot and DOM evidence are in `evidence/public-help-localization-2026-11-10/before/`.

One additional capture during a production build was unstyled and a later attempt to wait for ten unpublished labels timed out. Those are **not** accepted complete visual baselines or proof of a legal API failure. Separate read-only GETs returned legal index 200/10 rows, help categories 200/0 rows and status 200. In-place deployment/asset-transition behavior needs a dedicated reliability retest; do not hide the limitation or attribute it to this translation patch.

## Implementation

- Use the existing next-intl catalogs, with the complete `publicHelp` namespace owned by fa/en/de/es. Tests compare **unmerged** leaf sets, so English fallback cannot mask missing German/Spanish keys.
- Translate headings, forms/search, count labels, navigation/actions, feedback, publication states, all ten legal document labels, status/incident labels, loading/errors/retry and unknown-state handling. Unknown indicator/status is not silently presented as operational.
- Reuse `formatLocaleDate` for Persian Jalali and en/de/es formatting; use ICU numbers/counts/version labels. Long legal labels may wrap instead of forcing one row.
- Keep published article/legal/incident titles and bodies unchanged and text-escaped. Existing editorial clients read fa/en source editions; de/es interface does **not** claim translated approved documents/articles. Disclose original-language content; mark known source article/legal language for assistive technology. No legal policy text, article campaign, incident, SMS template or external delivery is invented.
- QA-HELP-VOTE-01 (P2): disable both feedback actions while a vote is pending, use a synchronous in-flight guard, reset per-article state and ignore an old article's delayed vote result after navigation. Abort stale article fetches. This is client duplicate prevention, not anonymous server-side vote identity/idempotency.

## Route/state matrix

| Route under `/{locale}` | Application interface exercised locally in all four languages | Release/visual status |
| --- | --- | --- |
| `/help` | Heading/subtitle, labelled search, loading, empty, failure/retry, links | PARTIAL; fresh browser/theme/viewport acceptance pending |
| `/help/categories/[slug]` | Topic heading, back destination, empty state; shared failure/loading labels | PARTIAL; not every route failure rendered in browser |
| `/help/faq` | FAQ title and unpublished state; shared failure/loading labels | PARTIAL |
| `/help/articles/[slug]` | Escaped original body, known content language, date/version, feedback/success/failure/duplicate and stale-result tests, unavailable state | PARTIAL; no production feedback submitted |
| `/legal` | Ten translated labels/publication states, empty published index | PARTIAL; no document published |
| `/legal/[slug]` | Translated fallback title, unpublished state, links and shared loaders/errors; original approved body retained | PARTIAL; published-record/date/visual acceptance still required |
| `/status` | Unavailable/retry, operational and unknown indicators, incident empty lists, labels | PARTIAL; live status content is not fabricated uptime evidence |
| `/status/incidents/[id]` | Known status labels/dates, original message/title, back destination; shared loading/error labels | PARTIAL; no real incident created |

## Actual tests and limits

`vitest run features/help-center/PublicHelpViews.test.tsx features/help-center/PublicHelpLocales.test.tsx` — **41 tests / 2 files PASS** before final formatting/release. Focused ESLint and final web TypeScript must pass and are recorded in the PR. Source data in unit tests are explicitly synthetic fixtures and are not seeded/published. Initial TypeScript failures in new test matcher options and StatusLabel child type were corrected, not ignored or skipped.

Do not mark these page families COMPLETE or LIVE_VERIFIED from a unit run: final-head hosted CI/build, mobile/tablet/desktop, light/dark/simple, fa RTL and en/de/es LTR screenshots and API-backed error/empty/available states remain required. New local production build is capacity-blocked; reused dependencies do not prove Next 15 build compatibility. No medical/private/customer data is used.

Next: run hosted final-head CI, merge normally only when repository checks permit, then verify exact deployed SHA. Run anonymous help/FAQ/legal/status page renders in four languages and chosen modes, no voting/publication or incident creation in production. Keep authored-content editions, private authenticated workflows, unsupported SMS, Jajiga rights and source-image/CDN limitations separate from UI translation acceptance.
