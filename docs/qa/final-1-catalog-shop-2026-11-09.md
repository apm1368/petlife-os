# Final batch 1/6 — catalog, seller and shop checkpoint

2026-11-09 UTC. Code baseline main `a8079ead045ae41f2a9162e4c9713189b6317076`; last production probe `d9d2189c0644d0ac8637b8d2179e94ff29b7a83f`, public products `items: [], total: 0`. No legitimate production offer is available to verify purchase. Previous batch commerce, localization and release QA were read; historical fake inventory was not restored. Current worktrees preserved and no source, payment data, ledger, volumes or uncommitted work discarded. About 171 MiB free disk.

Decisions: C-12 source import creates central drafts only; PL-09 seller central-product selection/request/review; F-06/F-07 commission remains unchanged. Product-design reference and existing shop design-review evidence consulted. No UI or landing HERO change in this fix; no new visual-alignment claim.

## FINAL-CATALOG-01 — P2 seller offer can target an unavailable central product

The seller offer create service previously accepted any productVariantId without checking variant activation or parent product publication. A known draft/inactive ID could receive a pending seller offer/inventory; a missing UUID could reach an FK failure. The transaction now requires an active variant belonging to an ACTIVE central product and returns a validation error before creating either offer or inventory. The seller's own price/stock remain on SellerOffer/InventoryItem; no source price, stock or central content is changed. Existing verification/operational seller guards and pending admin moderation remain authoritative.

Local tests: 8/8 API tests PASS across importer, Digikala parser/security and new seller selection boundary. 43/43 web tests PASS across ShopHomeView, CartView, CheckoutView and SellerOffersView. Focused API ESLint/diff checks PASS. Added database/HTTP coverage to seller-offer-moderation E2E: draft product, inactive variant and unknown variant reject without offer/inventory writes, followed by existing valid creation/moderation/cart journey. This E2E is NOT_RUN locally and must pass hosted CI. No migration or real charge.

## Source evidence

One read-only robots request and one allowed public category GET at `https://www.digikala.com/search/category-pet-supplies/`: response body 14,506 bytes; zero product links matching `/product/dkp-...` and no JSON-LD. No query, restricted product path, login or access-control bypass. Robots contains restrictions including query strings and dkpi paths; an allowed crawl path does not establish content/image reuse rights. Zero products imported. No authorized pet-catalog feed or owner-supplied licensed dataset is configured here. Keep the existing disabled importer boundary until accessible data and required permissions exist; no working live import claim.

## Integration and remaining work

- #228 clinical fix is merged; production deployment is still being checked separately. #227 SEO and #229 support passed their original-head CI, but protected merge rejected a stale base. Normal update-branch requested for both; fresh CI must pass before merge. #230 governance is pending. No admin bypass used.
- #231 framework security upgrade has a confirmed CI lint failure after upgrading eslint-config-next: existing internal `<a>` links must be reviewed and converted where appropriate. Its dependency audit has no critical advisories in the candidate lockfile, but no installed/runtime/build success is claimed; remaining high/moderate advisories stay open.
- Seller catalog request/admin duplicate review already exist; normalized-title duplicate behavior and concurrent review, seller isolation, returns, stock reservations, checkout failure/retry and import URL protections still need current DB acceptance. Do not treat component/unit tests as complete end-to-end coverage.
- fa/en/de/es whole-page, light/dark/simplified and mobile/tablet/desktop acceptance remain PARTIAL. No new screenshots or authenticated production account used in this slice.
- Next action: verify current-head CI, run seller moderation/catalog/checkout E2E on isolated DB, repair failures, then merge only after branch requirements pass; deploy and verify exact SHA and safe public catalog behavior. No LIVE_VERIFIED claim for this change before production verification.
