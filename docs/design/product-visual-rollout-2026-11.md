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

| Family                           | Reference board(s)                                         | Current routes/components to inspect                                                     | Status                                                                             |
| -------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Landing                          | 01 and landing storyboard in `product-design-reference.md` | `/`; `HomeLanding`, `ParkHeader`                                                         | Preserve HERO; not changed in this slice.                                          |
| Member dashboard/navigation      | 01, 15, approved member-home target                        | `/{locale}/home`; `MemberHomeView`, `GlassMemberHome`, `MemberFrame`, `MemberNavigation` | PR #210 merged to main; browser verification and production release pending.       |
| Account/household/pet            | 13, 15                                                     | `/profile`, `/profile/household`, `/pets/*`                                              | PR #211 open; 43 focused tests pass after rebase; browser verification pending.    |
| Shop/seller/checkout             | 01, 10, 15                                                 | `/shop`, `/cart`, `/checkout`, `/seller/*`                                               | PR #212 merged; 52 focused tests pass; production release and screenshots pending. |
| Health/care/clinical             | 08, 09, 11, 12, 15                                         | `/pets/*/health`, `/pets/*/care`, `/care-calendar`, `/provider/*`                        | Health/care shell PR #213 open; clinical page family is next.                      |
| Support/community/travel/shelter | 07, 15                                                     | `/support`, `/community`, `/travel`, `/animal-support`                                   | Support frame PR #215 open; public help, shelter and other pages remain.           |
| Backoffice/operations            | 15                                                         | `/admin/*`, `/seller/*`, `/provider/*`                                                   | Shared operator navigation PR #214 open; dense tables and role flows remain.       |

For each remaining family, record actual routes, source board, responsive/theme/language checks and real interaction states before marking it complete. Do not copy illustrative content from boards into production.

## Verification and blockers — 2026-11-09

- `main` is `54caf0278234dfb4119568d815b586f624c7cc75`. PR #210 passed its build check and merged through GitHub's normal squash path. PR #212 also passed its build check and merged to this main revision.
- Production `/api/health/version` still reports `fb2f421dae9506ae62cc8f4c896703adc9387b58`; readiness was healthy at the last check. Neither design merge has been verified in production.
- Latest open design PRs after rebase: #211 `afbc3a64` (account, build pending), #213 `8c89a819` (health/care, build pending), #214 `273a6987` (operator navigation, build pending), and #215 (support; this handoff update is included in its latest head, build pending). #212 is merged.
- Focused tests rerun after the #212 base change: account 4 files/43 tests, health/care 3 files/37 tests, provider/seller 3 files/27 tests, and support 4 files/17 tests all passed. Commerce 5 files/52 tests and web typecheck passed before #212 merged; CI on #212 passed.
- Web typecheck and `git diff --check` passed on the latest local batch. The full production build and actual browser screenshots remain blocked: this workspace has very low free space and no browser/CUA runner.
- Verify screenshots at mobile/tablet/desktop, light/dark, fa/en/de/es, and simplified mode before marking any page visually complete. Preserve the landing HERO exactly; other landing sections remain to be reviewed.
