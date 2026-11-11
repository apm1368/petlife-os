# Community visual slice — 2026-11

## Scope

- Source boards: reference 15 for cross-domain cards, states, focus, and responsiveness; reference 07 for the animal-support/community visual language.
- Routes: `/{locale}/community` feed and the existing shared `CommunityFrame` used by create-post and post-detail views.
- Feed posts now render as distinct elevated cards instead of a continuous divider list; topic and shortcut groups read as separate surfaces. The layout remains a two-column feed/aside on wide screens and collapses to one column on smaller screens.
- Shared spacing, border, focus, touch-target and radius tokens are reused. No user-generated text is translated or changed; no API, moderation, or permission behavior changed.
- The landing HERO and other landing sections are unchanged.

## Verification

- `pnpm exec vitest run features/community/CommunityFeedView.test.tsx features/community/CommunityPostDetailView.test.tsx features/community/chat/ChatViews.test.tsx`: 3 files / 35 tests passed, including all-locale feed copy, empty/error/loading, search, pagination and conversation tests.
- `pnpm exec tsc --noEmit`: passed.
- `git diff --check`: passed.
- Browser screenshots, theme/simplified-mode inspection and production build were not run because the workspace had approximately 72 MiB free. Visual completion is not claimed.

## Follow-up

Inspect feed, composer and post detail in a browser at mobile/tablet/desktop, light/dark, fa/en/de/es, and simplified display. Verify keyboard focus and overflow on long authored text and labels before marking the community family visually complete.
