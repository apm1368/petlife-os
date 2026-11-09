# Commerce visual rollout — 2026-11-09

## Scope

This slice applies the shared semantic visual tokens to the existing commerce
screens. It does not change product, cart, seller, price, stock, payment, or
checkout behavior.

| Board                                                   | Routes / page family                                                                    | Current status                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `reference-01.png` (approved palette, type, light/dark) | `/[locale]/shop`, `/shop/products`, `/shop/products/[id]`                               | Token-based surfaces, deep-green actions, shared card geometry; functional route tests remain the behavior baseline.        |
| `reference-10.png` (checkout/payment flow)              | `/[locale]/cart`, `/checkout`, `/checkout/[id]/confirmation`, `/orders`, `/orders/[id]` | Existing flow hierarchy retained; checkout cards, stepper and summary now consume shared surface, border and radius tokens. |
| `reference-15.png` (cross-domain QA)                    | Shop and checkout states                                                                | Existing empty/error/offline behavior is retained; reduced-motion and keyboard-focus rules remain enabled.                  |

The references contain illustrative products, customers and amounts. None were
copied into the application. The existing HERO is outside this slice and was
not edited.

## Decisions and boundaries

Relevant decisions: DS-01, DS-03, DS-05, DS-06, DS-07, DS-10, DS-14, DS-16,
GC-10, C-01, C-02, C-03, C-12, O-01..O-12, F-06 and F-07.

Commerce CSS no longer declares a parallel plum palette or theme-specific
colors. It consumes the shared token set for surfaces, deep-green emphasis,
focus, card geometry, touch targets and shadows. Theme and locale direction
remain controlled by the existing app shell. Central product content remains
separate from seller offers; external source price and inventory behavior is
unchanged.

This PR is based on the shared-pattern/dashboard PR #210 because that change
removes the page-wide campaign palette override. Until #210 merges, this
branch must not be retargeted to `main`; after its merge, rebase/retarget and
rerun the commerce checks against the final diff.

## Verification and limits

- `ShopHomeView`, `ProductResultsView`, `ProductDetailView`, `CartView` and
  `CheckoutView` existing tests are the targeted regression set.
- Automated DOM tests do not prove the visual match. This environment has no
  browser/screenshot runner available, and the working filesystem had about
  20 MiB free at the start, preventing a reliable production build.
- Before calling this family visually complete, capture light/dark and
  fa/en/de/es screenshots at mobile, tablet and desktop sizes, and inspect the
  actual rendered pages, including long German/Spanish labels and simplified
  display mode.
- Seller/backoffice operational pages and the remaining product families are
  not covered by this slice.
