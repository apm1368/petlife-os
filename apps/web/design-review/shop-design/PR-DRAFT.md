# [codex] Apply the approved warm shop and checkout design

The shop and buying journey used generic layouts after the approved park landing shipped. Shop home/results now use a warm plum/cream discovery pattern with a search sidebar and photographic hero. Product cards use large image wells and a shaped action footer; details, favorites, cart, checkout and order confirmation share commerce navigation and surfaces.

All existing catalog facets, variant/offer selection, pet compatibility, seller groups, changed-price acceptance, multi-seller delivery, online/installment flows and server-confirmed order status remain connected. Address editing/default selection now reaches the existing PATCH endpoint. Late detail/review responses cannot overwrite the newly selected product or pet. Clear-cart now reaches the existing endpoint after confirmation. Favorite saves, review pagination and checkout/confirmation read failures have visible recovery.

## Scope and evidence

Changes are in apps/web only. No API/schema, workflow/deploy or protected admin navigation edits. Screenshots and design checks are in apps/web/design-review/shop-design. Backend design gaps and a focused integration prompt are in BACKEND-GAPS.fa.md. The broader source-backed endpoint inventory is in approved-rollout/BACKEND-COVERAGE.md; it explicitly separates static UI matches and unresolved review candidates, and does not claim complete functional coverage.

## Validation

See design-qa.md for final command and browser results. Controlled API fixtures and synthetic unbranded product photos are review-only; no fake products, offers or prices are shipped. Owner waived separate QA sign-off; automatic checks are retained. No merge or deployment by this agent.

## خلاصه برای پدرام

فروشگاه و مسیر خرید با پترن تأییدشدهٔ کرم و آلویی پیاده شدند.
قیمت، موجودی، انتخاب فروشنده و پرداخت به منطق موجود متصل مانده‌اند و خطاها قابل مشاهده‌اند.
کمبودهای قرارداد بک‌اند و وضعیت پوشش APIها مستند شده‌اند؛ سایر حوزه‌ها در جدول rollout جدا هستند.
