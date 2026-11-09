# Travel route design-pattern mapping — 2026-11

- Source: the travel/search hierarchy in reference 01 and cross-domain route patterns in reference 15.
- Public browse routes (`/travel`, search, compare, and external stays) now select the existing `discovery` pattern. Booking and reservation routes (`/travel/book`, `/travel/bookings`, and `/bookings`) retain the existing `reservation` pattern.
- This corrects shared visual treatment only; route components, permissions, source data and booking behavior are unchanged. No sample availability or price is introduced.
- Verification: `pnpm exec vitest run features/design-system/DesignRoot.test.ts` — 1 file / 7 tests passed; web TypeScript check and focused ESLint passed; `git diff --check` passed.
- Browser screenshots and production verification remain pending because the workspace has insufficient free disk for a local preview/build.
