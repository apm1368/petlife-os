# PET LIFE OS — cinematic product pages visual QA

Date: 2026-09-13

Visual basis: the approved PET LIFE cinematic landing/dashboard direction already present in this repository — deep forest surfaces, warm gold actions, sharp photographic scenes, generous 24–32px radii, Vazirmatn RTL typography, and restrained glass/elevation. The page family was compared against that same visual system at a shared desktop viewport and responsive mobile viewport.

## Browser verification

- `/fa/shop` — desktop: hero crop, RTL copy, search, five category tiles, five realistic product records, footer and navigation verified. No clipping or horizontal overflow.
- `/fa/services` — desktop: hero, search, six icon-led service buildings/categories and route actions verified.
- `/fa/services/GROOMING` — desktop: five realistic professional cards, filters, trust badges, times and pricing verified. Preview-only booking rows are visibly marked and disabled; API-backed rows keep the existing booking flow.
- `/fa/vet/find` — desktop and 390px mobile: hero, search, filters, five provider cards, emergency/telehealth affordances, responsive stacking and mobile navigation verified.
- `/fa/welcome?authPreview=1` — desktop and 390px mobile: two-panel cinematic sign-in, readable light form surface under dark theme, 48px actions, no horizontal overflow. Mobile measurements: document 375/375px, form 375px, buttons 287.6×48px.

## Functional checks

- Search fields accept input and shop search retains the production products route.
- Public navigation preserves locale and RTL.
- Live shop/service/vet responses continue to map from existing APIs.
- Real booking navigation and booking-store population remain active only for API-backed service records.
- Local preview catches unavailable APIs and exposes five explicitly labelled realistic records instead of impersonating live data.
- Auth methods failure now degrades to existing email/phone/password choices without an unhandled runtime error.
- `prefers-reduced-motion` protection remains active globally.

## Code verification

- TypeScript: passed with `tsc --noEmit -p apps/web/tsconfig.json`.
- Focused UI tests: 9/9 passed across shop, service hub, service results and vet discovery.
- `git diff --check`: passed; only Windows LF/CRLF notices were emitted.
- Backend/API gaps for every visible global pattern are documented in `docs/product/frontend-backend-gap-backlog.md`.

final result: passed
