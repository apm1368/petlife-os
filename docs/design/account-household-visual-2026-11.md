# Account and household visual slice — 2026-11

## Reference and scope

- Primary board: `docs/design/references/reference-13.png` (account home, profile, household, members, invitations, pet permissions, privacy, security and calendar states).
- Cross-domain constraints: `docs/design/references/reference-15.png` and `docs/design/product-design-reference.md`.
- Decision codes: DS-01, DS-03, DS-05, DS-06, DS-07, DS-10, DS-14, GC-10, UX-04, UX-11, PL-08, PL-11.
- Routes: `/{locale}/profile`, `/profile/personal`, `/profile/household`, `/profile/membership`, `/profile/notifications`, `/profile/security`, `/profile/privacy`, `/profile/activity`, and `/profile/clinic-notes`.

## Implementation

The existing account read models, invitation approval, membership, privacy and security operations are preserved. This slice adds a route-family stylesheet to the account navigation/layout: token-based selected navigation, warm raised surfaces, consistent card radius, natural green active states, an explicitly semantic attention surface, readable account identity and household rows, and responsive horizontal navigation. It does not change APIs, authorization, copy, user data or the public landing HERO.

## Verification

- `pnpm --filter @petlife/web exec vitest run features/account/AccountOverviewView.test.tsx features/account/HouseholdCenterView.test.tsx features/account/AccountNav.test.tsx features/account/PersonalSettingsView.test.tsx --reporter=dot`: 4 files / 43 tests passed.
- `pnpm --filter @petlife/web typecheck`: passed.
- `pnpm --filter @petlife/web exec eslint features/account/AccountNav.tsx`: passed.
- Prettier check on the new stylesheet and this handoff: passed; `git diff --check`: passed.
- Browser screenshots and rendered fa/en/de/es, light/dark, mobile/tablet/desktop review were not available in this session; no browser/CUA capability was exposed. Full production build remains blocked by the approximately 20 MiB free disk recorded in the workspace. Do not mark the family visually complete until these checks are performed.
