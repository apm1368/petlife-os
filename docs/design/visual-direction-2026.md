# PET LIFE — Visual direction 2026 (canonical)

Short and executable. Tokens: `packages/design-tokens/css/tokens.css` and `typography.css`. Layout primitives: the "VISUAL FOUNDATION" section of `apps/web/app/globals.css`. Full token tables and the earlier audit: `visual-direction-2027.md` (still valid; this doc is the rulebook that sits on top of it).

## 1. Principle
Calm, warm, editorial, trustworthy. At least 75–85% of every screen is neutral (paper and stone). Brand colours are accents, never the dominant background. One inverse band at most per page.

## 2. Colour roles
| Role | Token | Light | Dark (warm charcoal, not black) |
|---|---|---|---|
| Page | `--surface-page` | #F6F3EC paper | #141614 |
| Work surface | `--surface-raised` | #FFFDF9 | #1B1E1B |
| Sunken band | `--surface-sunken` | #EEEAE1 stone | #232723 |
| Inverse band | `--surface-inverse` | #17241D forest-charcoal | #E9E5DB |
| Text | `--text-primary` / `-secondary` / `-muted` | graphite #1B201C / #525A53 / #6A716A | #EEEBE4 / #B9BCB3 / #969B92 |
| Brand (text/icon) | `--brand-primary` | #1F5A3D forest | #8CC79A |
| Brand (filled button) | `--brand-solid` + `--on-brand` | #1F5A3D / white | #2E7650 / white |
| Secondary accent | `--accent-plum` | #6A4D78 | — |
| Interaction accent | `--accent-cobalt` | #2D58A6 (links in dense admin only) | — |
| Attention / danger | `--status-attention` / `--status-concern` | amber #8A5A0A / coral #B4463A | tuned |

Rules:
- Filled buttons use `--brand-solid`, never `--brand-primary` (in dark, `--brand-primary` is a light green that fails contrast under white text).
- Status colour appears only on a dot, icon or short label (with a `*-tint` background), never as a card background.
- No neon, no rainbow, no random gradient. The only gradient allowed is the sky in illustrations.

## 3. Typography (Vazirmatn for Persian, Inter for Latin)
Display (landing hero only) `clamp(2.25rem…4.25rem)`/800 · Page title 1.75rem/750 · Section 1.125rem/700 (landing h2 is fluid up to 2.4rem) · Subheading 1rem/650 · Body 0.95rem, line-height 1.85–1.9 in Persian · Small 0.875rem · Metadata 0.8125rem/500 · Label 0.8125rem/650 · Metric 1.5rem/750 with tabular figures.
- Persian needs looser line-height than English; Latin headings get negative tracking.
- Bold is reserved for headings, labels and metrics. Body text is never bold.
- Persian UI shows Persian digits; dates are Jalali in Persian and Gregorian in English. The backend stays UTC/Gregorian.

## 4. Spacing, radius, elevation, layers
- Spacing scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72.
- Section rhythm on the landing: `clamp(64px, 9vw, 128px)`.
- Radius: 6 (controls) · 10 (buttons, inputs) · 14 (surfaces) · 18 (media and pet photos only).
- Elevation: `--shadow-1` (raised object) and `--shadow-2` (menu, sheet, dialog, floating panel). Nothing else. Separate things with borders and surface contrast before reaching for a shadow.
- z-index tokens: sticky 30, header 40, menu 50, drawer 60, dialog 70, toast 80.

## 5. Components and composition
- **Sections, not cards.** Use a flat section with a divider. A card is only for an independent object: a pet, a booking, an order, a stay. Never nest a card inside a card.
- **Rows.** For a list of destinations, use `heading | hint | arrow`, rows divided by a 1px line (`.lp-row` on the landing, `pl-row` in the app).
- **Width.** Consumer reading text is capped at ~36–40rem. Work surfaces (dashboards, admin, tables) use the full viewport up to 1600px with a fluid gutter (`clamp(16px, 4vw, 56px)`).
- **Density.** Consumer screens are warm and spacious. Admin, provider and seller screens are compact and dense. The difference is deliberate.
- **Buttons.** Primary means filled `--brand-solid`. Secondary means raised surface with a strong border. Quiet means text only. Touch height is at least 44px (48px on the landing).
- **Icons.** Lucide only, exported through `@petlife/ui`. Never use emoji or text glyphs (`⌄`, `◐`) as controls.

## 6. Motion
- Durations: 120ms (hover, press) · 180ms (menu, tab, select) · 260ms (sheet, step, reveal).
- Easings: `--ease-out` and `--ease-emph`. No bounce.
- `prefers-reduced-motion` disables everything. Content must render fully without JavaScript: reveal effects only hide bands that are still below the fold *after* hydration.

## 7. RTL / LTR
- RTL is structural. Use logical properties (`inset-inline`, `margin-inline-start`, `border-inline-start`) everywhere.
- Directional icons flip: forward is `ArrowLeft` in Persian and `ArrowRight` in English.
- Illustrations are physical artwork and never mirror.
- **Owner exception:** on Persian desktop, the main navigation sits on the left (the reading end), grouped with the tools. The brand holds the right edge alone. This applies to both the landing header and the member header (`member-shell.css`).
- The language switch and the theme switch are independent controls. Switching one never changes the other.

## 8. Illustration language
- Original flat SVG with no outlines: warm paper sky, Alborz ridge with snow, a muted city, recognizable but simplified Azadi and Milad towers, Persian-garden cues (cypress trees, a long pool), round park trees, cats on benches, a person walking a dog.
- Every colour is a `--sc-*` variable defined in `features/landing/landing.css`, with a separately designed dusk palette for dark mode (lit windows, lamp glow).
- Each scene is `role="img"` with a localized `aria-label`. Scenes live in `features/landing/scenes.tsx`: `TehranScene`, `TravelScene`, `MemoryScene`, `CommunityScene`, `PetPortrait`. Reuse them for empty states rather than adding a new style.
- Never: stock clipart, mascots, childish cartoons, photoreal AI renders, a vehicle without product meaning, or the retired "Cookie" demo pet.

## 9. Truthful UI
- Every illustrative sample carries a "نمونه" / "Example" chip.
- Unknown is shown as unknown (muted, with a question icon), never as healthy, allowed or available.
- External or unavailable integrations show `SANDBOX`, `NOT_CONFIGURED`, `BLOCKED_EXTERNAL` or `NOT_IMPLEMENTED` as localized labels. There are no fake loading states or fake results.
- No dead UI: every control navigates, changes state or is disabled with a reason. Placeholder footer labels are not allowed.
