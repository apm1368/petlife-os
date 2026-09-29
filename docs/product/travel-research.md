# Travel, Trip Hub, Insurance and Places — Product Research (Batch 5)

Scope: product mechanics studied from the publicly documented behaviour of Booking.com (pet-friendly filter, rate plans, free-cancellation badges, price breakdown), Airbnb (instant book vs request, host response window, verified reviews), BringFido (pet-policy detail per property: species, weight, fees), Jabama/Jajiga (Iranian stay marketplaces: Toman prices, Jalali dates, host confirmation), and pet insurers' public product pages (Trupanion, Lemonade Pet: exclusions and waiting periods). No visual design, copy or data was copied. Where PET LIFE deliberately differs, the reason is recorded.

## 1. Observed behaviour → PET LIFE adaptation

| Area | Observed | PET LIFE adaptation | Where |
|---|---|---|---|
| Domain model | Property → room type → rate plan → nightly availability → reservation. | Listing / Unit (interchangeable stock with a quantity) / RatePlan / Availability (per-night override + booked nights) / Booking / Trip / PetPolicy / TravelRequirement are separate models; a Booking carries snapshots of the rate plan, pet policy and nightly prices, so later edits never change a made booking. | `schema.prisma`, `TravelBookingService.hold` |
| Pet-friendly filter | "Pets allowed" is a single yes/no; fees and limits are hidden in fine print. | The property's own statement is shown field by field (species, number, weight, fee per pet per stay, deposit, vaccination/health proof, leash, carrier, breeds, restricted areas). Anything not stated reads "Not specified" — never "allowed". | `policyFacts`, listing detail |
| Pet match | BringFido lists rules; the traveller compares by hand. | Server-side match of the traveller's pets against the stated rules with three outcomes only: MATCH, POTENTIAL_CONFLICT, MORE_INFO_NEEDED, each with plain-language reasons. It is explicitly not a safety verdict. Conflicts cannot be held; missing information requires an explicit acknowledgement. | `matchPetPolicy` |
| Search | Destination, dates, guests, filters, sort, map. | Destination + dates (Jalali in fa) + pets (signed-in pets, or an anonymous species/count/weight shape; private pet ids never go into URLs). Filters: type, price, rating, verified, no pet fee, free cancellation, instant booking, amenities. Sorts: recommended (explainable), price, rating, distance, best pet match. Stays that are full or clearly conflict are hidden, and the empty state says so. | `TravelSearchService.search` |
| Whole-stay price | Booking.com shows nightly price then adds fees late. | With dates, results show the whole-stay total including the pet fee; the detail page itemises nights, rate adjustment, pet fee, refundable pet deposit, pay-now and pay-at-property. | `priceStay`, `PriceBreakdown` |
| Free cancellation | Badge on rates with a free-cancellation window. | Only an explicit FREE_UNTIL rate plan counts. A listing's free-text terms are never read as "free". | `hasFreeCancellationRate` |
| Instant vs request | Airbnb: instant book, or request with a 24h host window. | INSTANT_BOOKING confirms (or asks for payment) at once; REQUEST_TO_BOOK waits up to 24h (capped at check-in), then expires and releases the nights. After acceptance the traveller has 24h to pay. Nothing is charged before acceptance. | `TravelBookingService`, expiry worker |
| Inventory holds | Rooms are "held" during checkout. | Reserving writes booked-night rows immediately (unique per unit/night/slot, so the last room cannot be sold twice) with a 15-minute hold; expiry releases them. | `holdNights`, `processExpiries` |
| Payment | Pay now / deposit / pay at property. | Rate plan decides: PAY_NOW, DEPOSIT (percent) or PAY_AT_PROPERTY. Online payment goes through the existing gateway layer (sandbox until merchant credentials exist); only a gateway-reported success confirms. | `pay`, H07 |
| Cancellation & refunds | Refund per the rate's terms; host cancellation refunds fully. | Refund computed from the snapshotted terms at the moment of cancellation and shown before confirming; provider cancellation always refunds the full online amount; refunds reuse the ledger/refund service. | `decideTravelRefund`, `RefundsService.refundStandalonePayment` |
| Changing dates | Booking.com: change dates if the rate allows. | A change is applied atomically only when the amount paid stays the same and the new nights are available; otherwise the original booking is untouched and the traveller is told to rebook. | `modify` |
| Reviews | Verified-stay reviews; host may reply. | One review per completed stay, first name + stay month only; one public host response; Trust & Safety can hide with an audited reason; hidden reviews leave the rating. Ranking uses a Bayesian average (prior 4, weight 5). | `review`, `ratings` |
| Health documents | Some hosts ask for vaccination proof by e-mail. | The traveller shares a chosen health document with that booking only, until one day after check-out, through short-lived signed links; they can revoke it any time. Providers never see the health record. | `shareDocument`, `providerDocumentUrl` |
| Travel requirements | Government rules change; aggregators rarely cite sources. | Admin-curated requirement library with source, URL, jurisdiction and verification date; rows over 180 days old are flagged. Adding a rule to a trip creates a REQUIRED row with copied provenance — never READY. | `TravelRequirementRule`, `addFromRules` |
| Insurance | Exclusions buried below premiums. | Exclusions sit at the same level as coverage on product and compare pages; submission needs explicit consent (recorded text + time); only the insurer decides, through its own portal; "approved" is explained as insurer acceptance, not cover. | insurance module, insurer portal |
| Places | Pet-friendly places directories with user updates. | PostGIS nearby search; pet facts (leash, water, pet area, opening hours) are nullable and shown as "Not specified" when unknown; users report outdated data; admins resolve with audit. | places module |

## 2. Honest constraints

- **No hotel, airline or channel-manager integrations.** All inventory is entered by partners in PET LIFE; nothing is scraped or synchronised.
- **Payments** remain sandbox until merchant credentials exist (BLOCKED_EXTERNAL, as in Batches 3–4).
- **Partner payouts are not automated.** Partner and admin finance pages show real booked, collected and refunded amounts and state `PAYOUTS_NOT_AUTOMATED`.
- **No map provider.** Search and detail say the map is unavailable and keep list view with distances where coordinates exist (`TRAVEL_MAP_AVAILABLE = false`).
- **Requirement library** ships empty in production; the QA seed uses rows labelled as samples, never presented as official rules.
- **Insurance** is a lead/application workflow, not underwriting or policy issuance.

## 3. Intentionally excluded

- Flights, trains and pet-transport bookings (listing types exist for the future; they are not searchable stays).
- Dynamic pricing, coupons and paid ranking.
- Price changes on modification (would move money without a new payment step).
- Automatic "pet-friendly" inference from reviews or amenities.
