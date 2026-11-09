# Product visual rollout — 2026-11

This handoff tracks implementation against the approved visual references. It is not a claim that every route has been visually reviewed or is complete.

## Shared visual baseline

- Source of truth: `docs/design/product-design-reference.md`, `docs/decisions.md` (DS-01–DS-20, UX-04, UX-11, GC-10, PL-04, PL-06–PL-08, PL-11), and the reference boards in `docs/design/references/`.
- Reference 01 provides the cross-surface palette, typography, direction and product examples. Reference 15 is the authoritative cross-domain consistency/state/permission/responsive/RTL/dark-mode board. Reference 13 informs account, household, pet access and calendar patterns.
- The existing dashboard target at `apps/web/design-review/approved-rollout/targets/member-home.webp` informs hierarchy and placement only. Its example names, records and values are illustrative and were not copied.
- Existing components and tokens in `packages/ui` and `packages/design-tokens` remain the shared implementation. No new UI package or component set was introduced in this slice.
- The public landing HERO is outside this slice and was not changed.

## Current slice: member dashboard and shared route colors

| Area                      | Route(s)                       | Implementation                                                                                                                                                                                                                                             | Status                                                                                            |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Member dashboard          | `/{locale}/home`               | Uses real selected-pet, care, booking, order, subscription and travel read models; shared UI primitives; four-locale copy; semantic token-based cards and empty/loading/error states.                                                                      | Implemented; web unit suite, web typecheck and focused ESLint pass. Browser verification pending. |
| Cross-route visual tokens | Routes wrapped by `DesignRoot` | Removed the legacy campaign-plum overrides from the shared pattern layer. Existing canonical warm surfaces, natural deep-green brand, semantic status colors and designed light/dark tokens now flow through instead. Preserved role/density layout rules. | Implemented; application tests pass. Cross-family browser/visual regression pending.              |
| Pet context isolation     | `/{locale}/home`               | Removed the fallback that could display another household pet's appointment when the selected pet has none. Added a regression test.                                                                                                                       | Implemented; regression test passes as part of the web suite.                                     |

Dashboard visual structure follows the reference hierarchy: greeting and pet/household controls, selected pet identity and permission-filtered destinations, needs-attention region, upcoming care, recent health/activity, next appointment, membership/orders/stays, and product-area shortcuts. Dashboard data is not synthesized to fill a panel. The appointment panel now stays scoped to the active pet.

## Coverage matrix and next slices

| Family                           | Reference board(s)                                         | Current routes/components to inspect                                                     | Status                                                                               |
| -------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Landing                          | 01 and landing storyboard in `product-design-reference.md` | `/`; `HomeLanding`, `ParkHeader`                                                         | Preserve HERO; not changed in this slice.                                            |
| Member dashboard/navigation      | 01, 15, approved member-home target                        | `/{locale}/home`; `MemberHomeView`, `GlassMemberHome`, `MemberFrame`, `MemberNavigation` | Shared color correction and dashboard CSS implemented; browser verification pending. |
| Account/household/pet            | 13, 15                                                     | `/profile`, `/profile/household`, `/pets/*`                                              | Not yet reviewed in this slice.                                                      |
| Shop/seller/checkout             | 01, 10, 15                                                 | `/shop`, `/cart`, `/checkout`, `/seller/*`                                               | Not yet reviewed in this slice.                                                      |
| Health/care/clinical             | 08, 09, 11, 12, 15                                         | `/pets/*/health`, `/pets/*/care`, `/care-calendar`, `/provider/*`                        | Not yet reviewed in this slice.                                                      |
| Support/community/travel/shelter | 07, 15                                                     | `/support`, `/community`, `/travel`, `/animal-support`                                   | Not yet reviewed in this slice.                                                      |
| Backoffice/operations            | 15                                                         | `/admin/*`, `/seller/*`, `/provider/*`                                                   | Token override corrected; dense tables and role flows still need page-level review.  |

For each remaining family, record actual routes, source board, responsive/theme/language checks and real interaction states before marking it complete. Do not copy illustrative content from boards into production.

## Verification and blockers

- Baseline at start: `origin/main` `fb2f421dae9506ae62cc8f4c896703adc9387b58`; production version endpoint reported the same SHA. This design branch starts from that main SHA.
- Current branch: `design/shared-dashboard-foundation-2026-11-09`.
- `pnpm --filter @petlife/web test -- MemberHomeView.test.tsx --reporter=dot`: 302 test files and 1,852 tests passed (Vitest interpreted this invocation as the full web suite; the new active-pet regression was included).
- `pnpm --filter @petlife/web typecheck`: passed.
- `pnpm --filter @petlife/web exec eslint features/home/MemberHomeView.tsx features/home/GlassMemberHome.tsx features/home/MemberHomeView.test.tsx`: passed.
- `git diff --check`: passed.
- Workspace disk had approximately 20 MiB free, so a full production build and browser capture are not safe until space is available.
- No browser/CUA tool was available in the managed environment. Existing automated unit tests can still be run; screenshots at mobile/tablet/desktop and rendered light/dark/four-locale checks remain pending and must not be inferred from CSS or component tests.
- No route family is marked visually complete based only on using the shared colors.
