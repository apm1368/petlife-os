# Approved commerce design implementation

Branch: `codex/stab-shop-design`, based on current mainline `a5a672d` (member-glass already merged). This stage covers shop home, results, product cards/details, favorites, cart, checkout and order confirmation. Other approved domains remain separately tracked in ../approved-rollout/README.md.

## Behavior

The shop uses warm cream/plum surfaces, a photographic hero, a discovery sidebar and sculpted product cards. Home search submits existing URL-backed catalog filters; result filters retain all server facets, sorts and pagination. Cards open product detail so seller/variant/stock and pet compatibility remain visible before buying. Prices, promotions and availability are server values.

Cart preserves seller groups, changed-price acceptance and blocking safety/stock issues. Address editing and household-default selection now reach the existing update API with visible failures. Blank optional edit fields retain their existing server values, stated in the form. Clear-cart uses the existing API only after confirmation and retains items with a visible error on failure. Checkout retains address, review, seller-specific shipping and online/installment subflows, idempotency keys and server-confirmed order status. Initial checkout/order reads and failed favorite/review actions now show recovery instead of silently failing.

No API/schema, deployment, workflow, protected admin or production settings changed.

## Evidence and limitations

Before/after captures use controlled API fixtures with explicitly synthetic product photography under fixtures/. These product images are not imported by production code, exposed through a preview mode or used to replace a merchant's actual images. Existing product image URLs are displayed at runtime. The new decorative hero is disclosed on /credits.

Browser and test results are recorded in design-qa.md. No live customer/payment or VPS session is asserted. The approved references are ../approved-rollout/targets/shop.webp and products.webp; checkout retains its actual four-step semantics rather than copying a reference's three labels.

Read [backend gaps and integration prompt](BACKEND-GAPS.fa.md). Full source-backed API inventory: ../approved-rollout/BACKEND-COVERAGE.md and backend-ui-coverage.json. Static matches do not establish full functional coverage.

## Screenshots

| Surface | Persian desktop | Persian mobile |
| --- | --- | --- |
| Shop home | [After](shop-fa-1440.webp) / [Before](before-shop-fa-1440.webp) | [After](shop-fa-390.webp) / [Before](before-shop-fa-390.webp) |
| Product results | [After](products-fa-1440.webp) / [Before](before-products-fa-1440.webp) | [Viewport](products-fa-390-viewport.webp) / [Full page](products-fa-390.webp) / [Before](before-products-fa-390.webp) |
| Product detail | [After](detail-fa-1440.webp) | [After](detail-fa-390.webp) |
| Cart | [After](cart-fa-1440.webp) | [After](cart-fa-390.webp) |
| Address checkout | [After](checkout-fa-1440.webp) | [After](checkout-fa-390.webp) |
| Order status | [After](confirmation-fa-1440.webp) | [After](confirmation-fa-390.webp) |

English equivalents and viewport captures are alongside these files. `browser-checks.json`, `action-checks.json` and `edge-checks.json` record controlled verification.

Proposed board #4 entry: `codex/stab-shop-design — PR pending — approved shop/results/detail/cart/checkout + existing address edit/default and clear-cart APIs; frontend checks pass; local Prisma and GitHub write authentication blocked; no merge/deploy.`
