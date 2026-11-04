# PET LIFE OS shared UI

`@petlife/ui` is the implementation boundary for the shared design system. It contains no routing, fetching, domain writes, or page redesigns.

## Use

Import the stylesheet once at the application root, then use semantic components and tokens only.

```ts
import "@petlife/ui/styles.css";
import { ObjectCard, PrimaryActionBar } from "@petlife/ui";
```

Vazirmatn and Inter are already self-hosted by `apps/web/lib/fonts.ts`; this package self-hosts IBM Plex Sans Arabic for Arabic screens. `lang="ar"`, `dir="rtl"`, and `data-theme="dark"` select the correct font, direction, and theme.

## Tokens

- Semantic colors: `brand`, `success`, `warning`, `error`, `info`, `pending`, plus surface/text/border roles.
- Typography: 12, 14, 16, 20, 24, 32; Persian body line-height is 1.7.
- Geometry: 4/8 grid, `--touch-target-min` (44), and `--radius-card` (16).
- Themes: complete warm light and dark token sets with AA checks for primary, secondary, and brand-on-brand pairs.

## Components

`ObjectCard` has fixed image/title/meta/status/action slots; it covers product, provider, order, event, animal and document rows. Other shared primitives are `StatusLabel`, `PrimaryActionBar`, `Input`, `DataTable`, `InlineConfirmation`, `ConfirmationDialog`, `TypedConfirmation`, `ToastProvider`, and `BarChart`.

All data-bearing primitives expose `ComponentStateView`: loading, empty, error, offline, and no-access. `BnplOption` is presentation-only and returns nothing until a caller passes the existing PY-20 feature flag as `enabled`.

The six structural templates are `ListPageTemplate`, `DetailPageTemplate`, `MultiStepFormTemplate`, `DashboardTemplate`, `TimelineTemplate`, and `ResultPageTemplate`. The approved Seller, Shelter, Medical Record, Checkout, Care Calendar, Clinical, Account, Support, Emergency, and backoffice screens map to one or more of these templates; page migration remains DS-13 work and is intentionally not included here.

## Storybook and checks

```bash
pnpm --filter @petlife/ui storybook
pnpm --filter @petlife/ui storybook:build
pnpm --filter @petlife/ui test
pnpm --filter @petlife/ui test:visual
```

Storybook renders fa/en/ar in light and dark. Playwright stores and compares the visual baselines under `visual/`; CI installs Chromium, builds Storybook, and runs the six visual scenarios. The design-system guard rejects hardcoded colors, raw font/spacing values, physical CSS direction properties, missing required tokens, and token contrast below AA.
