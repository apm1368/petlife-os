# Services, Vet & Booking — Product Research (Batch 3)

Scope: product mechanics studied from publicly documented behaviour of Rover (pet-service marketplace) and Fresha (salon/clinic scheduling), adapted to PET LIFE. No visual design was copied. Where PET LIFE deliberately differs, the reason is recorded.

## 1. Observed behaviour → PET LIFE adaptation

| Area | Observed (Rover / Fresha) | PET LIFE adaptation | Where |
|---|---|---|---|
| Service-first search | Rover starts from the service, the dates and the pets, then shows sitters. | Discovery starts from a category (`/services/:category`, `/vet/find`) with city, neighbourhood, date, species, home-visit, rating and price filters. All filters live in the URL, so a search is shareable and survives sign-in. | `DiscoveryService.search`, `ProviderDiscoveryView` |
| Location / distance | Map plus list, distance from an entered address. | Distance is computed from registered provider coordinates when the visitor shares a location. No map provider is configured, so the map view is honestly marked unavailable instead of being faked. | `haversineKm`, "Near me" |
| Trust signals | Reviews from completed stays, repeat-client badges, background checks. | Only real signals: PET LIFE verification status, Bayesian-weighted rating from verified bookings, completed-booking count, and credentials only when verified. Unverified providers are never listed. | `ProviderProfileView` |
| Provider profile | Rover: about, services and rates, reviews, policies. Fresha: team, services, location. | One Public Entity Detail page: identity and trust, About, Services (with options, duration, price, payment mode, booking mode, preparation), Team (bookable staff with a public bio), Location, Reviews, Policies, FAQ, and a sticky Book button on mobile. | `/providers/:id` |
| Request-to-book | Rover: send request → sitter accepts → pay. | Service-level `bookingMode = REQUEST` → `REQUESTED` with a deadline (`requestTtlHours`, capped at the start time) → provider accepts (→ `CONFIRMED` or `AWAITING_PAYMENT`) or rejects with a reason → `EXPIRED` automatically when unanswered. | `BookingLifecycleService`, `BookingExpiryWorker` |
| Instant booking | Fresha: pick a slot → confirm. | `INSTANT` → bounded Redis hold (default 10 minutes) → `CONFIRMED`, or `AWAITING_PAYMENT` for prepaid services. | `BookingsService.confirm` |
| Service variants | Fresha: service options with their own price and duration. | `ProviderServiceVariant` (size, duration, visit kind). The variant drives slot length and price; it is required when a service has options. | slot generator |
| Staff & "any professional" | Fresha: choose a team member or "any". | Staff qualification (`ProviderUserService`) plus bookability. "Any professional" picks the first available qualified staff member in stable id order — deterministic and explainable. | `SlotGeneratorService` |
| Resources | Fresha: rooms and equipment block capacity. | `ProviderResource` with a required type per service. Capacity is limited by free resources, enforced by a Postgres exclusion constraint. | migration `202609270002` |
| Double booking | Holds plus server validation. | Redis NX hold per slot, plus Postgres `EXCLUDE` per staff member and per resource. Tested with concurrent requests. | tests: "double booking protection" |
| Cancellation policy | Provider-chosen policy shown before booking; refund by policy. | Free-cancellation window and late refund percentage per service, snapshotted on the booking. A customer cancellation refunds by the snapshot; a provider cancellation always refunds in full. Refunds are *requested* into the finance workflow and never promised as instant. | `decideRefund`, `requestRefund` |
| Reschedule | Change time without losing the original. | In one transaction: old → `RESCHEDULED`, successor created with the same frozen terms and consent. If the new slot is lost, everything rolls back. | `BookingsService.reschedule` |
| Recurring | Rover: repeat weekly walks. Fresha: repeating appointments. | Weekly or every-N-weeks series for walking, training, grooming and rehab. Refused for prepaid services, because each occurrence needs its own payment. "Cancel this and following" is supported. | `createWeeklySeries`, `cancelSeriesFrom` |
| Waitlist | Fresha: join a waitlist for a full day and get notified. | First-come waitlist per service and time window. When capacity is released only the earliest eligible entry is notified. Never auto-booked, never auto-charged. | `WaitlistService` |
| Reviews | Only after a completed stay; provider can reply. | One review per `COMPLETED` booking, by its customer only. Provider public response. Trust & Safety can hide a review (audited); hidden reviews never count in averages. | `ProviderReviewsService` |
| Provider calendar | Fresha: day/week/month with staff columns and blocked time. | Day / Week / Month with staff filter, blocked periods and a "block time" action. The mobile view is an agenda list, never a squeezed grid. | `ProviderCalendarView` |
| Rebook | "Book again" pre-fills provider/service/pet. | Book again pre-fills provider, service and option; new availability is always required. | booking detail |

## 2. Recommended ranking (no paid placement)

`score = 3·hasSlotWithin7Days + 2·bayes(rating)/5 + min(completed,50)/50 + proximity`, where `bayes` uses a 4.0 prior weighted as 5 reviews and `proximity = max(0, 1 − km/20)` only when the visitor shared a location. Ties break by name, then id. The score is returned with each result so QA can explain any order.

## 3. Health data and bookings

A booking never opens the medical record. Health reading requires the owner's explicit choice in the booking flow (identity only, or health summary for the visit window). A `VET` booking gives the clinic operational authority to *record* the visit's clinical data, but not to read prior history. Granular sharing stays in *Share with Vet* (Batch 2). Clinical visits link to bookings only when the booking is the same clinic's own VET booking; Booking ≠ Clinical Visit.

## 4. Payments — honest constraints

Online prepayment and deposits reuse H07 through a shell Checkout → PaymentIntent. Only a `SUCCEEDED` gateway result confirms a booking. The simulated gateway is refused in production (`PAYMENT_SANDBOX_MODE=production`). No real Iranian merchant credentials exist yet, so live online payment remains **BLOCKED_EXTERNAL**. The default for seeded services is pay-at-provider or a sandbox deposit.

## 5. Intentionally excluded

- Paid ranking or sponsored placement.
- Auto-booking or auto-charging from the waitlist.
- Provider-initiated appointments for household pets without the owner's action. The provider has no authority to pick an arbitrary household pet; blocking time is supported instead.
- A generic form builder for intake. Intake is one category-specific field (reason, grooming notes, care instructions, pickup details).
- Grooming photo outcomes. There is no private-media pipeline for booking outcomes yet; completion uses the owner-visible note.
- Map tiles, until a map provider is contracted.
- Promotions on services. A shared Promotion engine is scheduled for Batch 4 and will apply to services and products alike, rather than adding a parallel coupon system now.
