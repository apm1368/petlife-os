# Commerce — Product Research (Batch 4)

Scope: product mechanics studied from the publicly documented behaviour of Chewy (pet retail with Autoship), Amazon (multi-seller offers on one product page), Digikala (Iranian marketplace conventions: Toman display, seller comparison, stock signals) and Zooplus (pet-first catalogue and repeat orders). No visual design was copied. Where PET LIFE deliberately differs, the reason is recorded.

## 1. Observed behaviour → PET LIFE adaptation

| Area | Observed | PET LIFE adaptation | Where |
|---|---|---|---|
| One product, many sellers | Amazon/Digikala: one product page, a default seller, and an "other sellers" list. | Product → Variant → Offer. The default offer is deterministic and explainable: available first, then the lowest price the customer actually pays, then offer id. Every other offer stays visible with its own price and stock. Unverified sellers are never shown. | `CatalogService.defaultOffer`, PDP |
| Search and filters | Category tree, brand, price range, in-stock, rating, attribute filters, facet counts. | Search with category (including sub-categories), species, brand, seller, Toman price range, in-stock, on-promotion, minimum rating and structured variant attributes (never free-text matching on descriptions). Facets are computed from the same candidate set. Every filter is in the URL. | `CatalogService.search`, `/shop/products` |
| Ranking | Opaque "featured" or paid placement. | "Recommended" is explainable: available first, Bayesian rating (prior 4.0 weighted as 5 reviews), review count, active promotion, newest, id. No paid placement. Four more sorts: newest, price ↑/↓, top rated. | `CatalogService` |
| Stock signals | "Only 3 left", "Out of stock". | Real stock only: in stock, low (≤ 5), out of stock. The cart re-checks stock on every read and blocks checkout when a line is unavailable. | `stockStateOf`, cart issues |
| Discounts | Strike-through "list price" often seller-invented; coupons stack. | Promotions are automatic and never stack: each unit gets its single best live promotion. The strike-through is always the seller's own current price, and only when a real promotion lowers it. Seller-typed "compare at" prices are never displayed. Discounts never go below 1 IRR. | `PricingService` |
| Price changes | Amazon: "price changed since you added it". | Every cart line is priced live. A changed price or ended promotion is flagged per line; the customer accepts new prices explicitly. Checkout freezes the priced lines, and the order is built from that snapshot — never from the live cart — and re-verified against the charged amount. | `CartService`, `CheckoutService` |
| Autoship | Chewy Autoship: scheduled orders charged automatically; skip, pause, change frequency. | Repeat delivery keeps skip, pause, resume, frequency, quantity and address, but **never charges automatically**: PET LIFE has no stored-credential payment rail. Two days before a cycle the customer is reminded, sees the live price, and confirms an ordinary checkout. A price change blocks the cycle until accepted. | `RepeatDeliveryService` |
| Cancellation | Cancel until shipped; after delivery, a return/refund request. | Cancel until the parcel is handed to a courier (fulfillment PENDING, AWAITING_SELLER_PREPARATION, READY_FOR_PICKUP): full refund, fulfillment cancelled and stock returned in one transaction. After delivery (7-day window) or a failed delivery: a refund request that finance reviews. Nothing is refunded automatically after dispatch. | `order-policy.ts`, `OrderLifecycleService` |
| Seller cannot fulfil | Marketplace seller cancels; customer refunded. | Seller cancel is only possible before dispatch and always refunds the customer in the same step. | `OrderLifecycleService.sellerCancel` |
| Reviews | Verified-purchase badge; sellers cannot remove reviews. | One review per delivered order item, by its buyer only. Only first names are shown. Trust & Safety can hide a review (audited); hidden reviews never count in the rating. | `ProductEngagementService` |
| Order number | Short human-readable number. | `PL-XXXXXXXX` derived from the order id — no second sequence to keep in sync. | `orderNumberOf` |
| Money | Iranian retail shows Toman. | IRR integers are the only stored and computed unit; Toman is a display transform (÷10). | `formatCurrency` |

## 2. Honest constraints

- **Payments:** only sandbox gateways exist (no merchant credentials). Live online payment remains **BLOCKED_EXTERNAL**, exactly as in Batch 3.
- **Couriers:** AloPeyk/SnappBox adapters are boundary stubs without credentials. Only real carrier quotes are shown as delivery options; the old flat "Express" surcharge was decorative and was removed.
- **Partial refunds:** the gateway path refunds a whole seller order. Refund requests therefore ask for the order total; item selection is recorded for the reviewer.
- **Multi-seller BNPL:** a financing refund covers the loan as a whole; multi-seller installment orders keep the pre-existing limitation.

## 3. Intentionally excluded

- Coupon codes, stacking discounts and "compare at" reference prices.
- Automatic recurring charges.
- Paid ranking or sponsored placement.
- Service promotions (the Promotion model supports the scope; services pricing does not consume it yet, so the API refuses SERVICE scope rather than pretending).
- Customer-uploaded review photos (no private media pipeline for reviews yet).
