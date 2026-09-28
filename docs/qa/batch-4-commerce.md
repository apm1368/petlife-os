# Batch 4 — Commerce QA record

## Automated gates (branch `claude/batch-4-commerce`)

| Gate | Result |
|---|---|
| `batch4-commerce.e2e-spec.ts` | 22 / 22 — pricing and promotion rules, client price/quantity tampering, checkout snapshot integrity, EXPRESS refusal, last-unit race, cancel-before-dispatch refund + restock, post-dispatch refusal, refund request → admin review → finance execute, refund-request race, order/review IDOR, verified reviews + moderation, favorites, repeat delivery (reminder once, price revalidation, no autopay, cycle advance), seller cancel with refund, seller isolation, admin RBAC + audit, address book |
| Full API e2e (14 suites) | green; two legacy expectations updated for intended changes (paginated search, earlier stock check) |
| API unit + lint | green |
| Web tests (121 files) | green |
| Web lint / typecheck / production build | green (warnings only, pre-existing `<img>` notices) |

## Isolated preview

API `:4100` + web `:3100` on the QA database `petlife_b4_qa_test` (Redis DB 7) with the Batch 2, 3 and 4 QA seeds. The live database is never touched. Seeds refuse any database that is not `*_test` unless named in `PETLIFE_QA_SEED_DATABASE`.

### Browser flow (Playwright, mobile 390)
Search → PDP → out-of-stock variant disabled → add large size → cart → checkout (default address) → review (subtotal, promotions, total) → per-seller shipping quote → sandbox online payment → confirmation → My Orders → cancel → "Order cancelled. Your refund has been issued."

Database check afterwards: charged 2,833,000 IRR = 2,630,000 − 147,000 promotion + 350,000 delivery = sum of the two seller orders; the cancelled order was refunded per order (1,650,000 of the 2,833,000 capture) and its stock returned.

### Page matrix (fa RTL + en LTR, desktop 1440 + mobile 390)
Checks per page: HTTP 200, `dir`/`lang`, no horizontal overflow, no visible skeleton after load, no console errors other than the expected anonymous 401 probe.

- Customer: shop, results, PDP, cart, checkout, My Orders, four order states (in transit, delivered + reviewed, delivered + open refund request, cancelled & refunded), repeat delivery list/detail, favorites — all clean.
- Seller: dashboard, orders, order detail, offers (repeat settings), promotions, inventory — all clean.
- Admin: commerce overview, orders, order detail, refund requests, products, reviews, inventory, sellers, promotions — clean after fixing a mobile overflow on the overview's daily-sales bars.
- Batch 2 (owner): pets, pet overview, health, care, care calendar — clean.
- Batch 3: customer bookings + booking detail; provider bookings, booking detail, calendar, services — clean.

### Findings fixed during QA
- Tracking milestones could show "Delivered" at the top while earlier milestones stayed unreached (no courier shipment record): the timeline now falls back to fulfillment timestamps and is monotonic.
- Persian UI showed Latin digits in counts (`{count}` is not locale-formatted in ICU): switched to `{count, number}` / plurals, including earlier batches' seller, provider and health counters.
- Open-ended age/weight suitability read "12 to ∞": now "from 12 months".
- Admin overview mobile overflow (grid bars).
- Native date inputs in the Persian UI now show the Jalali reading under the field (discovery, reschedule, provider calendar, vaccination). A full Jalali picker remains open.

## Live
Recorded after deploy (see the release report).
