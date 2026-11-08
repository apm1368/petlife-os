# Simple display mode (PL-12)

This is a reversible, device-local presentation preference. It is deliberately separate from the
account profile API, language selection, theme selection, and responsive breakpoints.

## Current behavior

- The user can toggle it from the public/landing header, member header, or personal preferences.
- `petlife-display-mode=simple` is stored in local storage and applied before first paint; route and
  locale navigation re-applies it.
- On non-landing page families it increases reading line-height and text size, makes form and
  action targets at least 48px tall, and shortens motion. Focus indicators and all content/actions
  remain present.
- The landing hero is explicitly excluded from its styles and remains unchanged.
- The current app locale catalog supports Persian and English only. German and Spanish labels and
  page translations are not claimed by this slice; PL-07 remains pending on the main branch until
  the locale catalogs and full product copy are delivered.

## Verification

Store, toggle, and route re-application tests live beside the implementation. Run them with:

```sh
pnpm --filter @petlife/web exec vitest run stores/display-mode-store.test.ts features/display-mode
```
