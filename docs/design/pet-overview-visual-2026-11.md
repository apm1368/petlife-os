# Pet overview visual slice — 2026-11

## Scope

- Source boards: reference 08 (health overview and record hierarchy), reference 13 (pet and household context), and reference 15 (shared states, accessibility, RTL/LTR and responsive consistency).
- Route: `/{locale}/pets/{petId}` (`PetProfileView`).
- Aligns the existing real-data overview into a reading column and a distinct, responsive shortcut/history rail. Information groups use the shared elevated surface, subtle border, card-radius, spacing and focus tokens.
- Preserves the current selected-pet and household context, permission-gated shortcuts, memorial mode, partial-care warning, and genuinely empty states. No API, schema, permission, financial or clinical behavior changed.
- The landing page and its HERO are not touched.

## Verification

- `pnpm exec vitest run features/pets/PetProfileView.test.tsx`: 1 file / 20 tests passed, covering fa/en/de/es empty states, loading/error, partial-care failure, retry, permission-gated links and pet-switch isolation.
- `pnpm exec tsc --noEmit`: passed.
- Prettier and `git diff --check`: passed.
- Browser screenshots and production build were not run: workspace had approximately 74 MiB free. Visual completion is not claimed; mobile/tablet/desktop, themes, simplified mode and real browser interaction remain to verify.

## Implementation notes

`PetProfileView.module.css` scopes responsive card/layout treatment to this route using existing semantic design tokens. The identity, medical content and action set remain sourced from the existing authorized API/read models.
