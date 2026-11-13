# OptLife — Decision Log (English Translation)

> **Non-authoritative translation notice.** This document is a convenience translation of
> [`docs/decisions.md`](./decisions.md). The **Persian `docs/decisions.md` is the authoritative
> binding product specification** and the sole source of truth for every decision code. Where this
> translation and the Persian original differ in wording, the Persian original governs. Any change to
> a decision must be made in `docs/decisions.md` first (WB-12), then mirrored here.
>
> Both files must always contain the same decision-code list. The code list is verified by
> `scripts/verify-decision-code-parity.mjs` in CI.
>
> Persian source: `docs/decisions.md` @ `a31bf84` (main). Translation date: 2026-11-05.

Nov 2, 2026 · @Pedram

## Introduction

This document records the owner's 134 approved decisions about OptLife (PET LIFE OS) processes and
features in one place. This document is the reference for every site-completion prompt.

- **Identifier:** every decision has a code (for example F-07). Prompts and tickets reference these codes.
- **Priority:** if this document conflicts with the "01 Product Analysis and Status" document, the
  Financial v1.1 document, or the original `opetlife - Final` document, this document governs.
- **Source of each decision:** "Owner" means a direct choice by Pedram. "Default" means a rule added to
  close a gap, valid until the owner explicitly rejects it (see the "Applied Defaults" section).
- **Decision change:** decisions are never deleted; a replacing decision is recorded with a new code and
  references the previous code.
- **Working hours:** wherever "working hours" appears it means Saturday to Wednesday 9–18 and Thursday
  9–13 Tehran time (AD-06).

## Final Summary

This document is the result of 424 questions and answers: 134 base decisions, 98 ideal features (V), and
300 fifteen-chapter decisions (UX, ON, PT, SH, SL, BK, VT, PY, NT, CM, LP/SR/AD-P, BO, ER, TC, GR).
From now on every prompt references only the codes in this document.

**Governing principles for the whole product**

- OptLife is an intermediary, not a seller (ER-02); revenue is only 7% commission, CPC, subscriptions, and advertising.
- The pet record is the heart of the product (GR-08); shop, services, and veterinary all connect to it.
- Privacy is the default: masked phone and address, location never precise, full PII only for superadmin (AD-03, SL-08, CM-18).
- Every external service has a manual or internal fallback (P-02, TC-02).
- No sensitive financial operation happens without second-person approval and an audit trail (F-15, BO-07, BO-14).

**Decisions that replaced earlier decisions**

| Previous | Replacement | Summary |
| --- | --- | --- |
| F-04 | T-21 | Night-time receipts are reviewed the morning of the next working day |
| F-17 | E-09 | Finance enters the internal ERP accounting |
| X-07 | V-57 to V-63 | AI is active, not "coming soon" |
| V-97 | T-14 | Data selling is dropped |
| AD-02 | BO-02 | Full role builder instead of preset roles + ticks |
| M-05 (upload section) | CM-11 | Contributing experts also make videos |

**Risks that must be seen before implementation**

1. **Online consultation and the electronic veterinary prescription** (V-54, VT-15) carries legal risk without a query to the Veterinary Organization; GR-12 covers only the eNAMAD licence and the systematization registration.
2. **CPC at a flat rate of 2,000 toman** is only safe with the P-01 filter; there is no daily cost cap for the seller.
3. **Night queues** (T-21) overlap with the rotating night shift (ER-12); the night shift is only for non-queue work such as the on-call test call (VT-18).
4. **Without a pivot criterion** (GR-15) the only failure measure is the distance from the 6-month target (GR-05).
5. **PR 59 is retained with conflicts resolved** (TC-17); this must be the first P0 job and must happen before any shared module (TC-18).
6. **All sections ship together** (AD-16); feature flags (P-03, TC-12) and the GR-14 checklist are the only controls over this risk.

**Next step:** the complete prompt map (GR-18), then the text of each prompt in chat (GR-19), in this order:
P0 repository and environments → P1 payments and wallet → P2 backoffice and role builder → the remaining modules.

## A — Account, roles, and user access

Every mobile number has one account that can simultaneously be customer, seller, and service provider.

| Code | Decision | Source |
| --- | --- | --- |
| A-01 | One account with multiple panels (customer, seller, service provider) and a switcher between panels | Owner |
| A-02 | The customer's national ID is collected only at the first wallet withdrawal (for IBAN matching, F-12) | Default |
| A-03 | If the head of household deletes their account, the household and pets are archived | Owner |
| A-04 | Abusive customer (repeated suspicious returns, forged receipt): risk label + restriction on card-to-card and returns; suspension only with admin approval | Owner |

## S — Seller: registration, vetting, cooperation model, warnings

The seller chooses between 7% commission and CPC top-up from day one; a specialist reviews the file
within 48 working hours.

| Code | Decision | Source |
| --- | --- | --- |
| S-01 | Two cooperation models from the start: commission, or panel top-up with a deduction per click (CPC). Model change via ticket | Owner |
| S-02 | CPC balance runs out: warning at the threshold, then products are hidden | Owner |
| S-03 | The minimum CPC top-up amount is configurable in the admin panel | Owner |
| S-04 | Seller registration with the original-document fields: owner (name, national ID, mobile, notification mobile), store (sole proprietorship/legal entity, auto code, name, description, landline, website, working days and holidays, logo, Instagram), address with map pin, financial (card, IBAN, tax code), documents (eNAMAD, licence), digital contract confirmation | Original document |
| S-05 | File review: one specialist; 48 working-hour deadline | Owner |
| S-06 | Section-by-section rejection with explanation; after correction only the corrected section is re-reviewed | Owner |
| S-07 | Every change to a confirmed seller's profile (IBAN/card, name and logo, address and documents, description and hours and Instagram) requires re-approval | Owner |
| S-08 | Until a change is approved, the previous profile version stays active and selling does not stop. Exception: with an IBAN change, settlement is halted until approval | Owner + financial document |
| S-09 | Dated documents (licence, permit, eNAMAD): warning 30 days before expiry, then automatic suspension | Owner |
| S-10 | Authenticity pledge and deposit: upload a deposit image + admin approval (the date the original was received and the amount are recorded) | Owner |
| S-11 | Shipping delay: warning; three repeats = seller suspension | Owner |
| S-12 | Seller cancelling a paid order: only before dispatch, with a recorded reason; automatic refund to the customer's wallet | Owner |
| S-13 | The seller must confirm the order within 4 working hours of payment; otherwise the order is referred to support for a call | Owner |
| S-14 | Suspending or reactivating a seller requires second-person approval | Owner |
| S-15 | Seller display order for a product: lowest price + performance score; the rest go under "other sellers" | Owner |
| S-16 | Seller panel reports: sales, clicks, and conversion rate per product; daily CPC consumption; settlement statement and deductions; performance score and warnings | Owner |
| S-17 | New order notification: SMS to the notification mobile + panel notification | Owner |

## C — Catalogue, price, overpricing, discount

The central catalogue is created by the admin content team; a price 30% above the market average is
overpricing and the product is hidden.

| Code | Decision | Source |
| --- | --- | --- |
| C-01 | The central catalogue (name, image, description) is created by the admin content team; the seller proposes and the admin standardises it | Owner |
| C-02 | Duplicate product requests are not allowed; the seller is linked to the existing product | Original document |
| C-03 | Every product has exactly 3 images | Owner |
| C-04 | Excel upload with a downloadable template; first match by barcode, then by name similarity with seller confirmation; mismatches go to the approval queue | Owner |
| C-05 | The expiry date of a consumable is recorded on each seller's stock and shown to the customer | Owner |
| C-06 | A price increase above 15% goes to the admin approval queue; other changes are only logged | Owner |
| C-07 | Overpricing = price more than 30% above the average of the other sellers of the same product | Owner |
| C-08 | Hitting overpricing: that product is hidden until the price is corrected | Owner |
| C-09 | When pricing and discounting, a warning about the legal collision with overpricing is displayed | Original document |
| C-10 | Discount codes are created by both OptLife and the seller; the cost falls to the creator (an OptLife code from commission, a seller code from their share) | Owner |
| C-11 | Delivery time and shipping cost are recorded for every offer | Original document |
| C-12 | Source imports create drafts only in the central catalogue; source prices, stock and seller offers are not imported, and source changes stay separate from local content until an administrator explicitly approves them | Owner |
| C-13 | Product directory (2026-11-13): Digikala photos and descriptions are imported into the central catalogue (the owner chose this after being told of the legal and takedown risk, which is theirs). Guardrails: fair-use pacing, stop on 403/429, re-hosted with provenance, a one-click takedown, sanitised text | Owner |

## O — Order, dispatch, delivery, return

All three shipping methods are active simultaneously; delivery becomes final with customer
confirmation or 3 days after dispatch is recorded.

| Code | Decision | Source |
| --- | --- | --- |
| O-01 | Shipping methods: seller self-dispatch with tracking-code entry; Alopeyk/SnappBox with API integration; Post/Tipax for intercity | Owner |
| O-02 | Each seller sets the in-city and intercity shipping cost | Owner |
| O-03 | The customer pays the Alopeyk/SnappBox cost at checkout; the live price is taken from the API | Owner |
| O-04 | Delivery: customer confirmation, otherwise automatically "delivered" 3 days after dispatch is recorded. Starts the 48-hour return clock and the 5-day settlement clock | Owner |
| O-05 | Responsibility for a lost or damaged parcel depends on the shipping method: platform courier → OptLife; seller dispatch → seller | Owner |
| O-06 | Daily dispatch list with a delay label and the warning counter (S-11) | Original document |
| O-07 | Returns within 48 hours of delivery for damage, mismatch, or expiry, with a photo | Financial document |
| O-08 | Initial return review by OptLife support | Owner (approved by financial document) |
| O-09 | The seller has 24 hours to respond to a return; otherwise it is decided in the customer's favour | Owner |
| O-10 | Returned goods come back by reverse courier at the seller's cost | Owner |
| O-11 | Return refund to the wallet (immediate), with the option to withdraw to the bank | Owner |
| O-12 | SMS to the customer for payment confirmation and order dispatch | Owner |

## F — Payment, wallet, card-to-card, settlement, commission, CPC

Phase one goes live with Zibal, card-to-card, and a live wallet; commission is a fixed 7% and the
gateway fee is inside it.

| Code | Decision | Source |
| --- | --- | --- |
| F-01 | Phase-one payment methods: Zibal gateway, card-to-card with receipt upload, wallet. Installment providers (SnappPay, DigiPay) after a contract | Owner |
| F-02 | Torob is only a channel for listing products, not a payment method | Owner |
| F-03 | Card-to-card goes to one OptLife company card | Owner |
| F-04 | (Replaced by T-21) 24-hour receipt review (a night and holiday finance shift is needed) | Owner |
| F-05 | The receipt review result is sent to the customer by SMS | Owner |
| F-06 | Fixed 7% commission for all verticals | Owner |
| F-07 | Commission basis: after discount, excluding shipping cost | Owner (approved by financial document) |
| F-08 | The gateway fee is with OptLife and inside the commission | Owner |
| F-09 | A CPC seller pays no sales commission; only the click cost | Owner |
| F-10 | CPC: a single flat rate for everyone; every click is chargeable (minimum filter: P-01) | Owner |
| F-11 | Customer wallet withdrawal: only refunded amounts, not top-ups | Owner |
| F-12 | The customer's withdrawal IBAN is verified by automatic matching of the IBAN name against the national ID | Owner |
| F-13 | Settlement period: weekly by default; change to 15-day or monthly with admin approval | Owner |
| F-14 | Settlement execution: PAya file output + manual result entry as the base path; automatic Zibal settlement if they offer an API | Owner (depends on Zibal) |
| F-15 | Settlement payment, refunds above the amount threshold, and commission-rate changes require second-person approval | Owner |
| F-16 | A per-payment-method disable switch in the admin panel, with no need to deploy | Owner |
| F-17 | (Replaced by E-09) Finance is not connected to accounting software; periodic document output for manual entry | Owner |

## B — Services, booking, veterinary

Booking payment happens only online and after the provider confirms; cancellation before the start is
fully refunded.

| Code | Decision | Source |
| --- | --- | --- |
| B-01 | Booking payment after the provider confirms (15-minute payment deadline per the current document) | Owner |
| B-02 | On-site payment is not allowed; all bookings are online | Owner |
| B-03 | Customer cancels a booking: full refund before the start | Owner |
| B-04 | Phase-one veterinary panel: appointment booking + visit summary + prescription. Clinic CRM, boarding, and clinical invoicing come later | Owner |
| B-05 | Clinic and veterinarian vetting: Veterinary System licence + practice permit | Owner |
| B-06 | Individual provider vetting (dog walker, trainer, mobile groomer): national ID + selfie, skill certificate, interview or in-person trial session | Owner |
| B-07 | SMS for booking confirmation/rejection and a reminder the day before to the customer | Owner |
| B-08 | New booking notification to the provider: SMS + panel notification | Owner |
| B-09 | The service panel and veterinary panel spec must be written (empty in the original document) | Gap |
| B-10 | Multi-pet bookings (2026-11-13): a member may bring several pets in one booking (default limit 4, set per service). Price is per pet for grooming, vet, training and walking, and per night per pet for boarding and sitting. Grooming, vet and training run the pets one after another, so the appointment lasts the duration × pets | Owner |

## U — User panel, household, memorial, subscription

The memorial has its own page and only becomes public with the owner's consent and admin approval;
subscriptions are monthly and annual with a 7-day trial.

| Code | Decision | Source |
| --- | --- | --- |
| U-01 | The "joined the angels" memorial: a separate page + a small link on the landing page (the landing page is not redesigned) | Owner |
| U-02 | Public photo display in a memorial: a separate consent checkbox + admin approval; revocable by the owner | Owner |
| U-03 | Condolence text at submission; a conditional data-retention promise: "until you delete it yourself" | Default (conflicts with the right to deletion) |
| U-04 | User panel feed: notifications, new products, new discounts, new events | Original document |
| U-05 | Household subscription: monthly + annual with a discount | Owner |
| U-06 | 7-day trial period, once per household | Owner |
| U-07 | Subscription benefits: educational videos + advanced record features (multiple pets, shared health) | Owner |
| U-08 | Vaccine and medication reminder SMS | Owner |
| U-09 | Original-document features that must be approved or built: user avatar, wallet, ticket from the user panel, address with pin and verification | Original document |

## M — Content, events, video, reviews, community, lost pets, adoption, support

All user-generated content is reviewed before publication, except lost pets which publish
automatically after 2 hours.

| Code | Decision | Source |
| --- | --- | --- |
| M-01 | In-person event with registration and a paid ticket | Owner |
| M-02 | Event creator: admin, or a provider/shelter with admin approval (7% commission on the ticket) | Owner |
| M-03 | Event entry: QR ticket + scan in the organiser's panel | Owner |
| M-04 | Ticket cancellation: full refund up to 48 hours before; organiser cancelling the event = full refund | Owner |
| M-05 | Educational videos on ArvanCloud with secure playback; only admins upload | Owner + current document |
| M-06 | Reviews and ratings only from a real buyer, after delivery or service completion | Owner |
| M-07 | All reviews are reviewed before publication | Owner |
| M-08 | Community posts are reviewed before publication | Owner |
| M-09 | Lost pet ad with admin approval; if not reviewed within 2 hours it publishes automatically. Approximate radius, contact only via internal chat | Owner + current document |
| M-10 | Adoption is free only; buying and selling animals is forbidden | Owner |
| M-11 | Adoption: admin approval before publication, adopter suitability questionnaire, record transfer with both parties' approval | Owner |
| M-12 | NGO vetting: organisation registration permit + an in-person or video visit | Owner |
| M-13 | An NGO must file a pictorial aid-usage report within 30 days; otherwise new campaigns are forbidden | Owner |
| M-14 | Terms text, FAQ, privacy, and the seller contract: drafted by Claude, reviewed by a lawyer | Owner |
| M-15 | "About us", triple terms, triple FAQ, and privacy pages must be built (not in the current page list) | Gap |

## X — Manual operations modules: taxi, insurance, migration, emergency, AI

Modules with no real integration stay alive as manual team operations, all managed in a single
operations queue in the admin panel.

| Code | Decision | Source |
| --- | --- | --- |
| X-01 | Modules with no real integration stay alive as manual team operations | Owner |
| X-02 | A single operations queue in admin with a type filter (taxi, migration, emergency, …) | Owner |
| X-03 | Pet taxi: origin, destination, and time form → a driver operator is found and quotes a price → the customer pays | Owner |
| X-04 | Insurance: for now only comparison and a link to the insurer; no underwriting and no claims | Owner |
| X-05 | Migration and outbound travel: free initial consultation, a paid case file with an expert price | Owner (matches current document) |
| X-06 | Emergency: a direct call button + a list of 24/7 clinics; no dispatch commitment | Owner |
| X-07 | (Replaced by V-57 to V-63) An /ai page with a "coming soon" label | Owner |
| X-08 | Pet taxi (2026-11-13): the price is fixed per ride whatever the number of pets; the number of pets is capped by the vehicle's capacity (default 3, set per service) | Owner |

## AD — Admin, support, notification, reporting, security, release

The admin team is 6 people or more; roles are preset and an access tick is added per person. All
sections ship together.

| Code | Decision | Source |
| --- | --- | --- |
| AD-01 | Admin team of 6+ with separate specialised roles | Owner |
| AD-02 | Preset roles + an access tick added per person | Owner |
| AD-03 | Personal information (mobile, address, national ID) is only shown in full to the superadmin | Owner |
| AD-04 | A support/operations operator sees the customer number only in a related open case, with a log entry | Owner |
| AD-05 | The admin action log (audit) is superadmin-only; non-deletable and non-editable | Owner |
| AD-06 | Working hours: Saturday to Wednesday 9–18, Thursday 9–13 | Owner |
| AD-07 | Separate ticket queues for customer, seller, and service provider | Owner |
| AD-08 | First ticket response within 4 working hours | Owner |
| AD-09 | A red ticket (past the deadline): notification to the queue supervisor + a red label | Owner |
| AD-10 | A closed ticket reopens with a user reply within 7 days; after that a new ticket with a referral is created | Owner |
| AD-11 | Customer SMS for: payment and dispatch, booking confirmation/rejection and reminder, vaccine and medication reminder, ticket reply, and receipt result. Everything else is in-site notification only | Owner |
| AD-12 | Promotional SMS only with user consent + membership cancellation | Owner |
| AD-13 | The admin creates SMS templates in the panel and links the Faraz template code to them | Owner |
| AD-14 | Management dashboard: sales and revenue (GMV, commission, CPC); operations funnel (pending receipt, red ticket, unconfirmed order); user growth; seller performance | Owner |
| AD-15 | Reports: live dashboard + Excel export | Owner |
| AD-16 | Official release: all sections together | Owner |
| AD-17 | Pre-release testing: load test, per-role QA with a real account on mobile, closed beta with 10 to 20 invited sellers, real purchase with real money on every payment path | Owner |
| AD-18 | Admin panel address: opetlife.ir/backoffice | Owner |

## E — ERP backoffice (opetlife.ir/backoffice)

The backoffice completely replaces the current admin; migrating admin and security comes before
site release, and the rest of the ERP is built after that.

| Code | Decision | Source |
| --- | --- | --- |
| E-01 | Backoffice completely replaces /admin; the current admin is migrated and completed, and /admin redirects to it | Owner |
| E-02 | Built inside the same monorepo and the same API; no data or logic duplication | Owner |
| E-03 | Two-step login (password + OTP or an authenticator app) for all backoffice users | Owner |
| E-04 | ERP modules: full accounting, team HR, internal tasks and projects + operator KPIs, CRM for seller and provider acquisition | Owner |
| E-05 | Accounting: double entry with a standard chart of accounts, automatic documents from site financial events, value-added tax report. No Moudiyan system integration in phase one | Owner |
| E-06 | Payroll: full calculation per labour law (insurance, tax, overtime) + payslip + automatic accounting document | Owner |
| E-07 | Attendance: logging into the backoffice starts a shift, with an end-shift button | Owner |
| E-08 | Scheduling: admin + security migration (E-01 to E-03) before release; accounting, HR, tasks, and CRM after release | Owner |
| E-09 | Replaces F-17: site finance enters the internal ERP accounting directly; until E-05 is ready, periodic document output continues | Owner |

## V — Ideal feature map

The owner has approved 98 ideal features. The "wave" column is a Claude proposal and is not yet
ratified: 1 = ship with the release, 2 = up to 6 months later, 3 = long-term or dependent on a
partner or hardware.

| Code | Area | Feature | Wave |
| --- | --- | --- | --- |
| V-01 | Pet | Digital identity card with QR for the collar; scan opens the pet page + owner notification with location | 1 |
| V-02 | Pet | Weight growth chart with a standard breed range | 1 |
| V-03 | Pet | Automatic vaccine and deworming schedule based on species, age, and city | 1 |
| V-04 | Pet | Scan the vaccine booklet and prescription with OCR and owner confirmation | 2 |
| V-05 | Health | Daily symptom journal with a trend chart | 1 |
| V-06 | Health | Medication reminder with a "given" tick between household members | 1 |
| V-07 | Health | Connection to a tracker and smart collar (activity, GPS) | 3 |
| V-08 | Health | Bilingual PDF health record with an authenticity QR | 1 |
| V-09 | Care | Task division between household members (walking turns, feeding) | 2 |
| V-10 | Care | Food purchase reminder based on consumption + one-click reorder | 2 |
| V-11 | Care | Recurring food and litter purchase subscription (Subscribe & Save) | 2 |
| V-12 | Care | Shared care calendar with sitters and boarding | 2 |
| V-13 | Memory | Birthday and anniversary celebrations with gift suggestions and discount codes | 1 |
| V-14 | Memory | Automatic annual album (slideshow video) | 2 |
| V-15 | Memory | Physical album printing from memories | 3 |
| V-16 | Memory | Online memorial ceremony with a guest message book | 2 |
| V-17 | Shop | "Suitable for my pet" filter with a sensitivity-interaction warning | 1 |
| V-18 | Shop | Side-by-side food comparison (protein, price per kilo) | 2 |
| V-19 | Shop | Price-drop and back-in-stock alerts | 1 |
| V-20 | Loyalty | Customer club with points (pawma) and tiering | 2 |
| V-21 | Loyalty | Friend referral with credit for both parties | 1 |
| V-22 | Loyalty | Monthly challenges with badges | 2 |
| V-23 | Loyalty | Cashback to the wallet | 2 |
| V-24 | Delivery | Delivery time-slot selection | 1 |
| V-25 | Delivery | Live courier tracking on a map | 2 |
| V-26 | Delivery | Gift card for someone else's pet | 2 |
| V-27 | Delivery | In-store pickup (Click & Collect) | 2 |
| V-28 | Trust | "Guaranteed authenticity" badge for deposit-holding sellers | 1 |
| V-29 | Trust | Photo reviews and a "verified buyer" badge | 1 |
| V-30 | Seller | Smart price suggestion relative to the market | 2 |
| V-31 | Seller | Time-limited sale campaigns with placement on the home page | 1 |
| V-32 | Seller | Inventory forecasting and a low-stock top-up warning | 2 |
| V-33 | Seller | Bundle packages and tiered discounts | 2 |
| V-34 | Seller | Mobile panel version with instant order notifications | 1 |
| V-35 | Seller | Multiple users with roles for one store (storekeeper, accountant) | 1 |
| V-36 | Seller | Sync API with the seller's inventory and accounting software | 3 |
| V-37 | Seller | Public Q&A on a product + in-order chat, without showing the number | 1 |
| V-38 | Seller | Branded store at opetlife.ir/s/name | 2 |
| V-39 | Booking | Recurring booking with automatic payment from the wallet | 2 |
| V-40 | Booking | Session packages with a discount | 2 |
| V-41 | Booking | Waitlist with a slot-opened notification | 1 |
| V-42 | Booking | Map and comparison of nearby providers with an availability-time filter | 1 |
| V-43 | Service | Live walking report (GPS route, photo, duration) | 2 |
| V-44 | Service | Daily boarding report with photo and video | 1 |
| V-45 | Service | Live boarding camera for the owner | 3 |
| V-46 | Service | Training progress card with goal and stage | 2 |
| V-47 | Provider | Mobile app (service start and end, report) | 2 |
| V-48 | Provider | Dynamic pricing (weekends, high-demand periods) | 2 |
| V-49 | Provider | Google Calendar sync | 2 |
| V-50 | Provider | Customer and pet file (preferences, behavioural warnings) with the owner's permission | 1 |
| V-51 | Safety | Accident report button with an instant OptLife call | 1 |
| V-52 | Safety | "OptLife verified" period and certificate | 2 |
| V-53 | Safety | Periodic covert inspections | 3 |
| V-54 | Veterinary | Paid online text and video consultation, without storing the conversation | 2 |
| V-55 | Veterinary | Post-surgery care with a checklist and photos | 2 |
| V-56 | Veterinary | Annual wellness plan with monthly payment | 3 |
| V-57 | AI | Symptom triage and referral to a vet, without diagnosis | 2 |
| V-58 | AI | Record summary for the vet before the visit | 2 |
| V-59 | AI | Purchase and booking assistant | 3 |
| V-60 | AI behind the scenes | Automatic pre-review of reviews and posts | 1 |
| V-61 | AI behind the scenes | Read the receipt amount and tracking number + detect forged receipts | 1 |
| V-62 | AI behind the scenes | Draft ticket replies | 2 |
| V-63 | AI behind the scenes | Generate product descriptions and catalogue tagging | 1 |
| V-64 | Emergency | Ultimate goal: an on-call clinic network + 24/7 phone triage + a pet ambulance | 3 |
| V-65 | Social | Public pet profile with followers | 2 |
| V-66 | Social | Play dates and neighbourhood walks | 3 |
| V-67 | Social | Breed and neighbourhood groups | 2 |
| V-68 | Social | Monthly photo contest with prizes | 2 |
| V-69 | Travel | Travel planner with a route and pet-friendly places | 3 |
| V-70 | Travel | Destination-country document checklist + deadline countdowns | 2 |
| V-71 | Travel | Flight booking with a pet through a partner agency | 3 |
| V-72 | Travel | Map of pet-friendly places with user ratings | 1 |
| V-73 | Support | Automatic monthly donation to a shelter | 2 |
| V-74 | Support | Virtual fostering of an animal with a monthly report | 2 |
| V-75 | Support | Rounding up the purchase amount for a shelter | 1 |
| V-76 | Support | Seller donation of a percentage of sales with a badge | 2 |
| V-77 | Lost pets | Instant alert to users within the area where the pet was lost | 1 |
| V-78 | Lost pets | AI image matching between lost and found pets | 3 |
| V-79 | Adoption | 30- and 90-day follow-up after adoption | 2 |
| V-80 | Backoffice | Unified work desk with SLA priority + Ctrl+K global search + macros and bulk operations | 1 |
| V-81 | Backoffice | Calls from inside the panel with a cloud PBX and call recording, without showing the number | 2 |
| V-82 | Backoffice | Live team board, CSAT, night and Friday shift planning | 1 |
| V-83 | Backoffice | Performance bonus linked to payroll KPIs | 3 |
| V-84 | Backoffice | Free report builder, cohort analysis, anomaly alerts | 2 |
| V-85 | Backoffice | Asking questions of the data in Persian (AI) | 3 |
| V-86 | Backoffice | Time machine for every record + suspicious admin behaviour alerts | 1 |
| V-87 | Channel | Android app (Cafe Bazaar, Myket) | 2 |
| V-88 | Channel | iPhone PWA with push notifications | 1 |
| V-89 | Channel | Bele and Telegram bots for reminders and order tracking | 2 |
| V-90 | B2B | Shared clinic management software (SaaS) | 3 |
| V-91 | B2B | Shop wholesale buying from distributors | 3 |
| V-92 | B2B | Public API for partners | 3 |
| V-93 | B2B | Influencer affiliate programme | 2 |
| V-94 | Revenue | Brand banners and ad placements | 2 |
| V-95 | Revenue | Premium seller subscription with advanced analytics | 2 |
| V-96 | Revenue | OptLife private label | 3 |
| V-97 | Revenue | (Dropped, T-14) Selling aggregated, anonymised market data to brands | 3 |
| V-98 | Scope | Persian + English, all of Iran from the start | 1 |

Effect on earlier decisions: V-57 to V-63 replace X-07 (AI is no longer only "coming soon").
V-64 is the ultimate goal of X-06 and X-06 stays in force until it is reached.

## T — Supplementary decisions

These 21 decisions close the open numbers and make project execution deterministic. Where they
conflicted with an earlier decision, the earlier decision was replaced.

| Code | Decision | Effect |
| --- | --- | --- |
| T-01 | CPC click rate: 2,000 toman | Makes F-10 numeric |
| T-02 | The refund amount threshold requiring second-person approval in the backoffice is configurable | F-15 |
| T-03 | The minimum CPC filter is approved | P-01 is final |
| T-04 | The household subscription price is configurable in the backoffice; the number comes later | U-05 |
| T-05 | Pawma: every 10,000 toman spent = 1 pawma; spent as a discount code | V-20 |
| T-06 | Friend referral: 50,000 toman to both parties, after the first purchase above 300,000 toman | V-21 |
| T-07 | The cost of pawma and cashback is borne by OptLife, from the commission share | V-20, V-23 |
| T-08 | Affiliate: 2% of purchases within 30 days of the link, from OptLife's 7% share | V-93 |
| T-09 | On CPC sellers' orders, OptLife pays pawma, cashback, and affiliate as a marketing cost | Closes the F-09 conflict |
| T-10 | Online consultation: each vet sets the price, within the platform's floor and ceiling | V-54 |
| T-11 | Brand advertising: shop and blog banners, weekly time-based sales, no ads in the health record | V-94 |
| T-12 | Round-up and monthly donations also carry a 1% charity fee | V-73, V-75 |
| T-13 | After account deletion, all records are anonymised and kept permanently (requires legal review) | A-03, U-03 |
| T-14 | Aggregated data selling is dropped | V-97 removed |
| T-15 | Content: content team + contributing vets with a "veterinary reviewed" badge and a link to the author's profile | M-05 |
| T-16 | SEO is a high priority: breed pages, city+service pages, product schema | New |
| T-17 | The proposed wave assignment of section V is approved as it stands | V is final |
| T-18 | The release date is not fixed; whenever it is ready | AD-16 |
| T-19 | Prompt execution: Codex and Claude Code, in parallel on separate branches | New |
| T-20 | Each prompt is one complete module | New |
| T-21 | Night queues (receipt, content pre-review) are only reviewed the morning of a working day. Lost pets publish automatically after 2 hours per M-09 | Replaces F-04; closes R-01 |

Consequence of T-21: a customer who buys by card-to-card at night waits until the morning of the
next working day for approval. The review time is shown at payment time. Reading receipts with AI
(V-61) is only a pre-review; final approval is human.

## Chapter 1 — General UX, navigation, and appearance

Mobile-first with a 5-tab bottom bar, a happier and higher-contrast visual identity, and a load-time
target under 3 seconds on 3G.

| Code | Decision |
| --- | --- |
| UX-01 | 5-tab bottom bar: Home, Pets, Shop, Services, Me |
| UX-02 | Home page: active pet card + today's tasks (medication, walk, appointment), then shortcuts and suggestions |
| UX-03 | Pet switcher: round avatars at the top of the page, like stories |
| UX-04 | Theme follows the device setting; default language Persian with a switcher in the profile |
| UX-05 | Jalali date in Persian, Gregorian in English, with a relative date ("in 3 days") |
| UX-06 | Persian digits + toman with thousands separators; stored in rial |
| UX-07 | Guest: browsing and cart are open; sign-in at payment or booking |
| UX-08 | Unified search (product, provider, article, place) with result tabs, tolerant of typos and Finglish |
| UX-09 | Warm and friendly tone with "you"; no jokes in health and money |
| UX-10 | Empty state: dedicated pet illustrations + one specific next action |
| UX-11 | Full WCAG 2.2 AA accessibility |
| UX-12 | Subtle and meaningful animation respecting "reduce motion"; celebration at happy moments (pet registration, first purchase, birthday) |
| UX-13 | Offline: pet record, QR card, and reminders work without internet (PWA with cache and sync) |
| UX-14 | Error: plain language + solution + tracking code + a "report to support" button |
| UX-15 | Support chat: AI first, handoff to a human during working hours, a ticket outside them |
| UX-16 | Performance: load under 3 seconds on 3G and green Core Web Vitals on a mid-range phone |
| UX-17 | The visual identity is redesigned with happier colours and higher contrast; the landing page and logo stay locked |
| UX-18 | Buttons are pill, flat, without gradients (the open question in the current document is closed) |
| UX-19 | No mascots; only real pet photos (empty-state illustration based on real pets or a photography style) |
| UX-20 | Mobile-first; desktop with a sidebar and wide layout; backoffice and seller panel are desktop-first |

## Chapter 2 — Registration and onboarding

Sign-in is mobile number + SMS code only; onboarding has 3 steps and all species are supported from day one.

| Code | Decision |
| --- | --- |
| ON-01 | Sign-in and registration: mobile + SMS code; password optional |
| ON-02 | 3-step onboarding: your name → add a pet (name, species, photo) → city; the rest is gradual |
| ON-03 | "I don't have a pet yet" path: breed selection guide, adoption, first-purchase checklist |
| ON-04 | Pet photo only for the avatar; breed selection is manual |
| ON-05 | Species from the start: dog, cat, bird, small mammals, reptiles, and aquatic animals |
| ON-06 | Without a known breed: a "mixed/unknown" option + size (small, medium, large) |
| ON-07 | Partner sign-up: the landing page "become an OptLife partner" (/seller and /partner) + an option in the Me panel |
| ON-08 | Seller sign-up form: multi-step with a progress bar, autosave, resumable from any device |
| ON-09 | Household invitation: shareable link in a messenger + SMS |
| ON-10 | 3 ready member access levels: partner owner, carer (logs work), viewer + fine-grained settings |
| ON-11 | Temporary pet-sitter access: a link with a care sheet, medication, and emergency number, without an account, with expiry |
| ON-12 | Profile completion: completion percentage + pawma per section + explanation of the benefit |
| ON-13 | Panel switcher from the "Me" menu, with a different header colour per panel |
| ON-14 | Short tips on first use of each section, dismissible |
| ON-15 | Help for the new seller: starting checklist, short educational videos, starter gift |
| ON-16 | Starter gift: 30-day commission model with 3% commission; CPC model with a 500,000 toman top-up gift |
| ON-17 | Bulk import: Excel (C-04) + "import with an assistant" by the OptLife team for more than 200 products |
| ON-18 | A user without a pet only gets in-site notifications; no SMS or calls |
| ON-19 | There is no legacy data; we start from zero |
| ON-20 | Registration: one line of terms links + a separate and optional checkbox (not pre-ticked) for promotional SMS |

## Chapter 3 — Pet profile and health

Both data conflicts of the current document are closed: mandatory gender is paired with "don't know", and a duplicate microchip no longer blocks saving.

| Code | Decision |
| --- | --- |
| PT-01 | Pet profile: photo header + tabs for summary, health, care, memories, costs, documents |
| PT-02 | Three colour labels "don't know / not recorded / doesn't have" + a "complete it" button |
| PT-03 | Correcting a photo mistake or a lost record: the owner alone for up to 7 days, then via a ticket; with an audit and restored reminders |
| PT-04 | Gender is not mandatory with a "don't know" option; older pets are backfilled with "don't know" |
| PT-05 | Duplicate microchip: the pet is saved, a flag is raised for support, and the previous owner is notified |
| PT-06 | Automatic vaccine schedule from the collaborating vet's approved table, editable in the backoffice, with the label "suggested; coordinate with your own vet" |
| PT-07 | Every medical record shows an "owner recorded" or "vet confirmed" label; a vet can confirm an owner's record |
| PT-08 | Costs: internal purchases and bookings automatically + manual entry for the rest, with a monthly report |
| PT-09 | Vaccine reminder 7 days and 1 day before; medication on the hour + 30 minutes later if not ticked |
| PT-10 | A household chore reminder goes only to the person on duty; if not done, to the others |
| PT-11 | Symptom journal: a concerning pattern (for example 2 days of not eating) → suggest booking a vet; the rules come from the collaborating vet |
| PT-12 | After death: stop that pet's reminders and promotional SMS, cancel future bookings with a full refund, stop its food subscription |
| PT-13 | Health sharing with an external vet: a 72-hour link with section selection + an access log |
| PT-14 | QR page: name, photo, vital sensitivities, a "I found it" button with anonymous chat; no owner number or address |
| PT-15 | Engraved metal QR tag sold in the shop; free with an annual subscription |
| PT-16 | Food consumption: pack weight + pet weight + the brand's consumption table, correctable by the user |
| PT-17 | Pet document wallet with categories, expiry dates, and renewal reminders |
| PT-18 | Memory space: 1 GB free, 20 GB with a subscription; video up to 60 seconds |
| PT-19 | Memories are private by default (household); public publishing with one click |
| PT-20 | Weight: manual entry + automatic from a visit + a monthly reminder for puppies |

## Chapter 4 — Shop and checkout

The shop is organised around "my pet" and checkout is single-page. The open question "package out of stock at payment time" is closed.

| Code | Decision |
| --- | --- |
| SH-01 | Shop home: "for [pet's name]" (rebuy + suitable suggestions), then sale and categories |
| SH-02 | Single product: pet-compatibility label with a reason, ingredient and analysis table, seller comparison, daily consumption and "how many days does this pack last" |
| SH-03 | Cart grouped by seller with separate shipping cost and time + a consolidation suggestion from the same seller |
| SH-04 | Package out of stock at payment time: a new summary + a suggestion of the same product from another seller; payment only with explicit confirmation |
| SH-05 | Single-page checkout pre-filled with previous choices |
| SH-06 | Wallet is on by default; the remainder via the gateway or a card |
| SH-07 | One OptLife code + a seller discount can be combined; two OptLife codes cannot |
| SH-08 | No minimum order; free shipping at the seller's discretion with an "X until free shipping" display |
| SH-09 | Tracking: a status bar per parcel + an estimated time + chat with the seller |
| SH-10 | Customer cancellation: immediate before the seller confirms; afterwards by request up to dispatch; refund to the wallet |
| SH-11 | Repeat purchase with an out-of-stock product: automatic substitution with the cheapest other seller if the price difference is under 10%, otherwise ask the customer |
| SH-12 | Repeat purchase has no discount; the benefit is convenience and automatic shipping |
| SH-13 | Prescription-only product: a "prescription required" label; purchase only with an electronic prescription or an uploaded prescription confirmed by the seller |
| SH-14 | Selling live animals in the shop is forbidden (consistent with M-10) |
| SH-15 | Categorisation: first by species, then by need (food, hygiene, toys, accessories, medicine) |
| SH-16 | Brand page with the official representative managed and an "official representative" badge |
| SH-17 | PDF invoice in the seller's name per parcel + a formal invoice with an economic code |
| SH-18 | "Product request": relevant sellers are notified + a demand report for the team |
| SH-19 | Abandoned cart: one in-site notification after 24 hours; no SMS |
| SH-20 | Weight and dimensions are mandatory in the catalogue; courier cost is computed automatically from weight |

## Chapter 5 — Seller workflow and UX

The seller dashboard is task-driven and customer privacy is protected; seller exit and counterfeit-product collision have a complete path.

| Code | Decision |
| --- | --- |
| SL-01 | Dashboard: "what needs doing now" (unconfirmed orders with a countdown, shipping today, returns, customer questions), then stats and charts |
| SL-02 | Performance score from on-time shipping, cancellation and return rate, and customer ratings; over the last 90 days |
| SL-03 | The component weights of the score are configurable in the backoffice |
| SL-04 | Shown to customers as simple badges ("fast shipping", "top seller"); the exact number only for the seller |
| SL-05 | A warning is cleared 90 days after it is issued; three active warnings = suspension |
| SL-06 | Temporary closure mode with a return date; products carry a "ships from date X" label; no score penalty |
| SL-07 | Multiple branches: separate stock per branch; ship from the nearest branch that has the item |
| SL-08 | The seller sees only the name and address of an open order; the number is masked; it is hidden after delivery |
| SL-09 | Seller calls the courier: the customer chooses whether their number is given to the courier |
| SL-10 | The 4-hour order confirmation deadline is counted in the seller's own working hours; the customer sees a realistic estimate |
| SL-11 | Chat: automatic filtering of numbers and external links + support access in a dispute |
| SL-12 | Objecting to a review: a public reply + a report to the moderator; deletion only for a breach of the review rules |
| SL-13 | Seller exit: request → stop new orders → complete open orders → 30-day retention → final settlement + CPC top-up refund + deposit release |
| SL-14 | Only a paid CPC top-up is withdrawable (not the gift), and only on exit or a model change |
| SL-15 | Handmade or own-brand products need a hygiene permit (food and treats) and a "handmade" label |
| SL-16 | The seller chooses the shipping range; the customer only sees products shippable to them |
| SL-17 | Counterfeit product: immediate product suspension, settlement hold, inspection; if proven, the deposit is executed, permanent exit, and a refund for all buyers |
| SL-18 | Monthly mystery-shopper purchase from a random sample + all sellers with the authenticity badge |
| SL-19 | The cooperation model can change once every 90 days, from the start of the next settlement period |
| SL-20 | Seller + service provider: one organisation with two roles and two separate vettings, one public page |

## Chapter 6 — Services and booking

Search starts from the service and the time and shows only independent providers. The boarding gate left over in the current document is defined.

| Code | Decision |
| --- | --- |
| BK-01 | Search: service → pet → time → map and list showing only independent providers, with the final price visible from the start |
| BK-02 | Price variables: pet size/weight, coat type (grooming), special needs with provider confirmation |
| BK-03 | Multi-pet: each pet has its own price + a second-pet discount at the provider's discretion; duration is based on the total |
| BK-04 | Boarding gate: valid vaccine, recent deworming, behavioural questionnaire |
| BK-05 | Incomplete vaccine: booking is conditional on uploading the vaccine card up to 48 hours before; otherwise it is cancelled with a full refund |
| BK-06 | Booking rejection: an immediate suggestion of 3 similar independent providers at the same time |
| BK-07 | Cancellation after payment by the provider: full refund + a warning; no compensatory credit |
| BK-08 | Customer no-show: the money goes to the provider; a third repeat = a 30-day booking restriction, with the right to appeal (because per B-02 everything is prepaid) |
| BK-09 | Calendar: weekly pattern + exceptions + a gap between appointments per employee |
| BK-10 | Reminder: the customer the day before (SMS) + 2 hours before (notification); the provider gets a morning schedule |
| BK-11 | Moving an appointment: free once up to 24 hours before; after that it is a cancellation and a new booking |
| BK-12 | Service settlement 5 days after completion, like the shop |
| BK-13 | Boarding: early return with a refund of half the remaining days; extension from the panel with a difference payment |
| BK-14 | Boarding acceptance: a checklist with a photo of the pet's condition and belongings + two-sided digital signature |
| BK-15 | Damage during service: incident report → settlement hold → OptLife review → the vet's cost is charged to the provider in case of fault |
| BK-16 | Save a favourite provider + choose an employee; an employee familiar with the pet is suggested first |
| BK-17 | Mobile services: coverage area on the map + travel cost based on distance + an arrival time window |
| BK-18 | Dog walker: private by default; group walks for up to 3 dogs with the owner's consent and a lower price |
| BK-19 | Service rating 2 hours after completion: an overall rating + 3 criteria (punctuality, handling of the pet, quality) |
| BK-20 | The provider's private rating of the pet is only for behavioural warnings and matching; it is never shown to the customer |

Conflict: BK-13 (a refund of half the remaining days) completes the B-03 policy for boarding that has
already started; B-03 applies only before the start.

## Chapter 7 — Veterinary and clinic

The record is shared with the vet at the owner's discretion and OptLife does not judge medical quality. The veterinary panel spec (B-09) is completed by this chapter.

| Code | Decision |
| --- | --- |
| VT-01 | At booking the owner chooses whether the vet sees the record; access lasts 7 days after the visit, with an AI summary (V-58) |
| VT-02 | The visit summary and prescription are entered into the record with a "vet confirmed" label and create a medication reminder and the next visit |
| VT-03 | "Prescription item order" → sellers that carry the medicine; the owner is free to choose |
| VT-04 | In-person visit is paid online; extra procedures are billed with a supplementary online invoice after the visit |
| VT-05 | Online consultation: asynchronous message with photo and video; answer within 2 hours; 24-hour follow-up |
| VT-06 | In-person referral: the consultation fee is deducted from the visit with the same vet if booked within 48 hours |
| VT-07 | Multi-vet clinic: one organisation, each vet has their own account and calendar, the clinic manager sees all, and settlement goes to the clinic |
| VT-08 | Multi-clinic vet: one professional profile, several workplaces with separate calendars, conflict prevention |
| VT-09 | Lab results can be uploaded by either the clinic or the laboratory, and by the owner |
| VT-10 | Annual wellness plan: a package per clinic with its own price, paid monthly from the wallet |
| VT-11 | Clinical complaint: OptLife does not judge medical quality; referral to the Veterinary System + review of service aspects |
| VT-12 | Public vet page: the system number and a verification badge; speciality, species, languages |
| VT-13 | Phase-one panel pages: today's schedule with a record summary, a consultation inbox with a countdown, an open follow-up list |
| VT-14 | Visit summary and prescription form with ready-made templates (vaccine, check-up, diarrhoea) |
| VT-15 | Prescription: medicine from the standard list + dose + frequency + duration + instructions, with a digital signature and an authenticity QR |
| VT-16 | Long-term access only to records the vet recorded themselves; everything else needs a new permission |
| VT-17 | The vet's private note is only for that clinic; the owner is aware that it exists |
| VT-18 | On-call list: clinic self-declaration + a monthly night test call; no answer = removal from the list |
| VT-19 | Post-surgery alert: a concerning response on the checklist or no entry within 24 hours |
| VT-20 | A product suggestion in a prescription uses only a generic name or category; no commission for the vet |

## Chapter 8 — Payment and wallet

The wallet has two separate balances and daily automatic reconciliation; double payment is closed by an idempotency key.

| Code | Decision |
| --- | --- |
| PY-01 | Card-to-card page: card number with a copy button, the account holder's name, the exact amount, a 30-minute deadline to upload the receipt, and the review time per T-21 |
| PY-02 | Stock reservation: 30 minutes until the receipt is uploaded; after upload, until the next working-day morning review |
| PY-03 | Receipt with a larger amount: confirm + the surplus to the wallet; smaller: a deadline to pay the difference, otherwise return to the wallet and cancel |
| PY-04 | Failed gateway payment: the bank's automatic 72-hour return, with no OptLife action (Zibal's verify stage is still mandatory) |
| PY-05 | Wallet with two balances: "withdrawable" (refunds) and "purchase only" (top-ups, gifts) + a history with filters |
| PY-06 | Gift credit expires after 6 months with a reminder 7 days before |
| PY-07 | Customer withdrawal within 2 working days with a transparent status; minimum 50,000 toman |
| PY-08 | Recurring payment without funds: a reminder 3 days before, a payment link at the due date, a 3-day deadline, then suspension |
| PY-09 | Settlement statement broken down per order (amount, commission, the seller's discount share, return, penalty, net) + PDF and Excel |
| PY-10 | An objection to a settlement line → a finance ticket with a 3-working-day SLA; the rest of the settlement is not stopped |
| PY-11 | Displayed prices include value-added tax; the invoice itemises it for taxable sellers |
| PY-12 | Seller debt is deducted from the next settlement; 30 days negative = a payment request and finally the deposit |
| PY-13 | CPC top-up via Zibal or card-to-card, with a formal advertising-services invoice |
| PY-14 | Automatic CPC top-up is optional, from the sales settlement when it falls below the threshold |
| PY-15 | The wallet balance cap and daily top-up cap are configurable in the backoffice |
| PY-16 | Transferring credit between users is forbidden; only via a gift card |
| PY-17 | Receipt: a success page with a tracking code + SMS + the receipt in the order list |
| PY-18 | Daily automatic reconciliation: Zibal against the ledger + the bank statement for card-to-card; mismatch alerts |
| PY-19 | An idempotency key for every payment; a duplicate payment automatically returns to the wallet |
| PY-20 | Installments: SnappPay and DigiPay, whichever signs a contract first |

## Chapter 9 — Notification and communication

The user controls each notification type per channel; critical and security notifications cannot be switched off, and quiet hours and an SMS cap contain the cost.

| Code | Decision |
| --- | --- |
| NT-01 | Notification centre: a bell with "my tasks" and "all" tabs; a critical notification at the top of the list |
| NT-02 | Settings: a table of notification type × channel (site, push, SMS, bot); critical ones (payment, security, own lost pet) cannot be switched off |
| NT-03 | Quiet hours 22 to 8 with no SMS and push, except for timed medication, security, and lost pet; user-changeable |
| NT-04 | A maximum of 2 non-critical SMS per day; the surplus goes to in-site notification |
| NT-05 | SMS failure: one retry on Faraz's second line, then push or bot; logged in the delivery log |
| NT-06 | Optional email for invoices, settlement statements, and the monthly pet report |
| NT-07 | Bele and Telegram bots with account linking from the profile; notification and a "given" button only |
| NT-08 | Terms change: notification 14 days ahead + a display of the changes; the seller re-confirms the contract |
| NT-09 | Bulk message from the backoffice with segmentation (species, city, role, subscription), a preview, and scheduling; over 1,000 people requires second-person approval |
| NT-10 | Security warnings that cannot be switched off: login from a new device, number or IBAN change, wallet withdrawal, adding a household member |
| NT-11 | Notification language = the user's chosen language across all channels; an English SMS uses a separate Faraz template |
| NT-12 | Neighbourhood lost-pet alert: a 3 km radius from the registered neighbourhood (not live GPS), only for users with this setting on, at most 3 per week |
| NT-13 | Survey: quarterly NPS + one question after the first purchase or booking; at most one survey per month per user |
| NT-14 | Partner communication: panel notification + weekly newsletter + Bele channel |
| NT-15 | Service disruption: a public status page + an alert bar on the site |
| NT-16 | Shareable monthly pet card: walks, weight, costs, best memory; a larger annual version |
| NT-17 | A seller or provider may message first, only in that order's chat and up to 30 days later; the customer can block |
| NT-18 | Chat is kept for 1 year, then anonymised and archived |
| NT-19 | Seller promotional SMS to customers is forbidden; promotion only via in-site campaigns and CPC |
| NT-20 | Event notifications based on city + pet species, in-site; SMS only with promotional consent |

## Chapter 10 — Community, content, and events

The content pre-review load is contained with AI and the precise location of users is never published. Events have multi-type tickets and an online version.

| Code | Decision |
| --- | --- |
| CM-01 | Post types: photo and short video, question and answer with a "vet-confirmed answer" badge, experience, and product or service introduction |
| CM-02 | Feed: people you follow + your groups + popular in your neighbourhood and breed |
| CM-03 | Pre-review: AI (V-60); low risk with fast batch approval, high risk with full human review |
| CM-04 | Forbidden: buying and selling animals, external advertising and contact numbers, non-professional medical advice, violence and animal abuse |
| CM-05 | Animal abuse: official reporting guide + content removal + evidence preservation |
| CM-06 | Violation: warning → 7-day publishing restriction → permanent community ban (the rest of the site stays open) |
| CM-07 | OptLife creates the groups; volunteer moderators with a limited toolset |
| CM-08 | Photo contest: monthly theme, votes by confirmed accounts + final team judging; prize is wallet credit |
| CM-09 | Blog: species × topic; a related article on the product page and the pet profile |
| CM-10 | Video: short multi-part courses with progress and a certificate; the first episode free, the rest with a subscription |
| CM-11 | Trainers and contributing vets make videos with a revenue share from the subscription based on watch time; admin approval before publication (replaces the "only admins" part of M-05) |
| CM-12 | Sponsored brand content with an "ad" label; never in the health section |
| CM-13 | Event: separate human and pet capacity, an automatic waitlist, a vaccine requirement for the pet |
| CM-14 | Multi-type tickets (standard, with pet, VIP) + early-bird discount + discount code |
| CM-15 | Ticket settlement 5 days after the event with a 7% deduction |
| CM-16 | Online event: webinar with a secure link + recording for subscribers |
| CM-17 | Public pet profile: free following, likes and comments with review, an option to close comments |
| CM-18 | Location in a post is only a neighbourhood name or public place; photo location metadata is removed automatically |
| CM-19 | Play dates only for confirmed accounts, in a suggested public place, with location sharing with the household and a post-meeting report |
| CM-20 | Each breed page: temperament, care, common diseases, monthly cost, related products and services, breed group |

## Chapter 11 — Support, lost pets, and adoption

A lost pet is registered with one button and the handover is safe with a hidden marker; adoption is completely free even from a shelter.

| Code | Decision |
| --- | --- |
| LP-01 | Lost-pet registration from the pet profile with one button; only the time and place of loss are asked |
| LP-02 | Anyone registers a "pet found" with a photo and place; automatic matching against nearby lost ads |
| LP-03 | Ownership claim: a question about the hidden marker or microchip + handover in a public place |
| LP-04 | Optional reward from the wallet; OptLife is the custodian; payment after the owner confirms the handover |
| LP-05 | A "private identification marker" field on the pet profile; never made public |
| LP-06 | The owner closes the ad with a "found" or "never mind" status; a renewal reminder after 30 days |
| LP-07 | Reporting an injured street animal to nearby approved shelters + a first-aid guide |
| SR-01 | Shelter page: animals ready for adoption, campaigns, goods needs, usage reports |
| SR-02 | In-kind aid: a needs list from the catalogue; the user buys and the seller sends directly to the shelter |
| SR-03 | The contributor only gets a simple OptLife receipt |
| SR-04 | Campaigns have no target-condition clause; every amount collected reaches the shelter |
| SR-05 | Virtual fostering: a monthly amount agreed with the shelter, a monthly report, transferable to another animal with consent after adoption |
| SR-06 | Shelter supervision: an annual inspection + complaint tracking; a breach = campaign suspension and notification to contributors |
| AD-P-01 | Adoption ad is mandatory: reason, compatibility with children and other pets, special needs, a short behaviour video |
| AD-P-02 | Adopter questionnaire: place of residence, experience, hours present, family members, other pets, landlord consent |
| AD-P-03 | The current owner selects the applicant; chat and an in-person meeting; then the record is transferred |
| AD-P-04 | Return within 30 days to the previous owner or a partner shelter, without shaming |
| AD-P-05 | Shelter adoption is also completely free; no acceptance fee |
| AD-P-06 | Against hidden selling: admin review, a ban on amounts in the text and chat, user reports; a breach = a ban from adoption |
| AD-P-07 | 30- and 90-day follow-up: a simple question + an optional photo; the result only goes to the previous owner with consent |

## Chapter 12 — Backoffice workflow

The backoffice has a full role builder and work is done in a shared queue with the lock released on completion; versioned settings and emergency switches guarantee control.

| Code | Decision |
| --- | --- |
| BO-01 | Starting roles: customer support, seller and catalogue specialist, finance specialist, content moderator, and manual operations |
| BO-02 | Full role builder: create a new role and assign permissions (replaces AD-02) |
| BO-03 | A shared queue; anyone picks up the work |
| BO-04 | Work desk priority: remaining SLA + amount or importance + repeat complaints from the same user |
| BO-05 | Transferring work between roles with a mandatory internal note |
| BO-06 | Permissions: module × action (view, create, edit, approve, delete, export) + data restriction (city, amount cap) |
| BO-07 | Only the superadmin creates roles; nobody grants themselves permission; sensitive permissions (finance, PII, role building) need a second approval |
| BO-08 | Picking up work = a 30-minute lock; inactivity returns it to the queue |
| BO-09 | "View as user" is read-only with a recorded reason and log; every action carries the operator's name |
| BO-10 | User page with a single timeline: orders, bookings, tickets, payments, warnings, internal notes |
| BO-11 | Compensatory credit up to the role's cap (for example 200,000); above that with supervisor approval; with a reason and a monthly report |
| BO-12 | Excel export with a permission; without PII except for the superadmin; watermarked with the operator's name + logged |
| BO-13 | Rules are automatic condition-action; only the superadmin changes a rule |
| BO-14 | Settings page with versioning, effective date, second approval for finance, and a rollback to the previous version |
| BO-15 | Automatic morning report to the manager: yesterday's sales, night queues, mismatches, alerts (in Bele and the backoffice) |
| BO-16 | CMS for banners, legal pages, FAQ, and home page blocks, with preview and scheduling; the landing page stays locked |
| BO-17 | Internal knowledge base + a step-by-step guide per work type |
| BO-18 | Login: password + mandatory TOTP; SMS OTP only as a fallback; 8-hour session; login = shift start (E-07) |
| BO-19 | Employee exit: immediate deactivation, open work returns to the queue, all sessions cancelled; the account is not deleted |
| BO-20 | Limited mobile version: dashboard, immediate second-person approvals, alerts |
| BO-21 | Superadmin emergency switches: stop registration, stop settlements, site read-only mode (with F-16) |

## Chapter 13 — ERP: accounting and human resources

OptLife is an intermediary in accounting terms and its revenue is only commission, CPC, subscriptions, and advertising. Payroll has a multi-stage approval cycle. The open question "chart of accounts" is closed by ER-01 (final confirmation with the accountant).

| Code | Decision |
| --- | --- |
| ER-01 | The standard chart of accounts of the Iranian Audit Organisation with marketplace-specific detail (seller custody, wallet, donations); accountant-approved |
| ER-02 | The intermediary model: customer money is a liability to the seller until settlement; OptLife's revenue is only commission + CPC + subscriptions + advertising |
| ER-03 | An automatic provisional document for every financial event; daily finalisation by the accountant; a final document only changes via a correcting document |
| ER-04 | Jalali financial year; monthly period closing (document lock); annual closing and opening documents |
| ER-05 | Reports: balance sheet, profit and loss, cash flow, four-column trial balance, quarterly value-added tax report, profitability per business line |
| ER-06 | Expense entry with invoice upload, cost centre, and manager approval; automatic document |
| ER-07 | Annual budget per cost centre + monthly comparison with actuals and a deviation alert |
| ER-08 | External auditor with a temporary read-only role |
| ER-09 | Personnel file: contract with a renewal reminder, documents, internal job history, assigned assets |
| ER-10 | Leave: request in the backoffice → direct manager approval; balance per labour law; automatic effect on shifts and payroll |
| ER-11 | Non-operator employees: manual check-in and check-out in the backoffice + correction with manager approval (completes E-07) |
| ER-12 | Weekly shift with night and Friday rotation, swapping with manager approval, a coverage-shortage warning; automatic overtime and night pay in payroll |
| ER-13 | Payroll cycle: automatic draft → HR review → manager approval → PAya file, insurance and tax lists → document and payslip |
| ER-14 | KPI bonus: a monthly score from SLA, CSAT, and work volume with configurable weights; a percentage of base pay with a cap; manager approval |
| ER-15 | Quarterly review: self-assessment + manager assessment + KPI data, with a target for the next quarter |
| ER-16 | Recruitment module (ad, résumé, interview, offer) and onboarding with a checklist |
| ER-17 | Internal tasks: project → task with an owner, due date, status; kanban and list; convert a ticket to a task |
| ER-18 | CRM funnel: lead → first call → meeting or demo → registration link → completed registration → first sale; automatic link to the seller's file status |
| ER-19 | Recruitment commission: a fixed configurable amount per partner who stays active for 30 days |
| ER-20 | Warehouse and purchasing for the private label and QR tags; OptLife is itself a seller in the marketplace |

## Chapter 14 — Technical, security, quality, and performance

The current hosting stays, but every external service has an internal fallback. No money flow enters main without a green E2E test.

| Code | Decision |
| --- | --- |
| TC-01 | The current hosting is kept |
| TC-02 | All critical services (font, map, AI, script) have an internal fallback; external AI can be switched off without breaking the flow |
| TC-03 | Automatic daily backup with 30-day retention, a copy at a second data centre, monthly restore test (RPO 24 hours, RTO 4 hours) |
| TC-04 | Three environments: development, staging on a separate subdomain with anonymised data, and production on opetlife.ir (the environment=staging problem is solved) |
| TC-05 | Login security: OTP rate limiting, SMS attack detection, active device management and logout-everywhere, a fresh OTP for withdrawal and IBAN change |
| TC-06 | Field-level encryption for national ID, IBAN, vetting documents, and clinical data + full encryption of backups |
| TC-07 | Independent penetration testing before release and annually; dependency scanning in CI |
| TC-08 | Uploaded files: malware scanning, type and size limits, metadata removal, temporary signed links for private files |
| TC-09 | E2E test for every money flow + unit test of the financial logic; a PR without a green test does not merge |
| TC-10 | Monitoring: self-hosted Sentry, centralised logs, uptime, alerts to Bele for error rate, latency, and payment failure |
| TC-11 | Release from main after staging approval, during low-traffic hours, one-click rollback, reversible migration |
| TC-12 | Feature flag panel in the backoffice: on and off, percentage of users, city, beta list |
| TC-13 | Target capacity: 1000 concurrent users without degradation, with horizontal scaling |
| TC-14 | Partner API: key with domain and rate restriction, versioning at /v1, public documentation + sandbox |
| TC-15 | Self-hosted analytics (PostHog or Matomo) + defined events for the funnels |
| TC-16 | Every PR from Codex or Claude Code: human review for finance and security, cross AI review for the rest, an evidence document |
| TC-17 | PR number 59 is retained with conflicts resolved |
| TC-18 | Parallel execution only for independent modules; shared modules (payment, schema) have only one executor at a time |
| TC-19 | Every prompt updates the technical document inside the repository (architecture, API, model, this document's codes) |
| TC-20 | Account deletion reaches anonymisation within 30 days; personal data export within 7 days |
| TC-21 | Explicit owner clarification, 2026-11-10, consistent with WB-13: independent human **security/financial CODE or PR review** is not a mandatory merge blocker. This supersedes only that human-code-review requirement in TC-16 within this scope; the original history remains. Inspect actual diffs/dependencies, complete relevant automated/security checks, fix confirmed issues and document remaining risks; verify required green CI on the final head and merge only through GitHub's permitted normal protected path, never bypassing protection. Deploy via the authorized pipeline after migration, backup and rollback checks, then verify the deployed SHA and actual safe behavior. This is solely a code-review/merge clarification: product-level second-person approval, segregation of duties, amount/role limits, authorization and audit for **sensitive financial or administrative operations** remain unchanged. Code authors receive no authority to approve those operations. |

## Chapter 15 — Brand, marketing, growth, and KPI

The north-star metric is monthly active households and the competitive advantage is a pet record connected to everything. Release readiness is measured by a readiness checklist, not a date.

| Code | Decision |
| --- | --- |
| GR-01 | North-star metric: monthly active households with at least one care task or transaction |
| GR-02 | In-person services from Tehran and Karaj; shop across all of Iran |
| GR-03 | Acquisition channels: programmatic SEO, influencers (affiliate), partnerships with clinics and pet shops (gift QR tags, referral codes), Instagram advertising, and Yektanet |
| GR-04 | Acquire supply and demand simultaneously |
| GR-05 | Target 6 months after release: 5,000 active households, 150 sellers, 100 providers |
| GR-06 | Weekly KPIs: registration → pet registration → first transaction conversion, 30-day retention, time to a new seller's first sale, CAC per channel |
| GR-07 | Brand slogan: "From the first day to forever" |
| GR-08 | Competitive advantage: the pet record connected to everything (suitable food, reminders, vet) |
| GR-09 | First-purchase discount: 15% up to a 100,000 toman cap, from OptLife's share |
| GR-10 | Expand services to the next city when 80% of the previous city's bookings are confirmed within 24 hours; order: Isfahan, Shiraz, Mashhad, Tabriz |
| GR-11 | Social networks: Instagram-centric + Bele; user-generated and short educational content |
| GR-12 | Pre-release licences: eNAMAD and the systematization registration |
| GR-13 | Release with whatever content exists |
| GR-14 | Release readiness checklist: all money flows E2E green, penetration test with no critical findings, 2-week beta without P1 bugs, licences, initial content |
| GR-15 | No fixed "pivot" criterion is defined |
| GR-16 | Pedram is the final owner of the document; every change is recorded with a new code and communicated to the executed prompts |
| GR-17 | Quarterly review of decisions |
| GR-18 | Prompt writing: first the complete map of all prompts, then the text of each one |
| GR-19 | Each prompt is delivered in chat |
| GR-20 | First release campaign: not yet chosen (open question) |

# Round Two — 300 Final Decisions

Four axes: the global English edition, idealism, UX in a many-section product, and nested and ambiguous flows. After this round, the coding phase and work division begin.

## Chapter 1 — Scope of the global edition

The global edition is a digital subscription, under a separate foreign company, with the same codebase, deployment, and separated data.

| Code | Decision |
| --- | --- |
| GL-01 | The global edition is a digital subscription only: record, reminders, AI, video, memory, QR; no shop and no physical services |
| GL-02 | A separate foreign company (UAE, Turkey, or Estonia) with a shared brand, separated infrastructure, and separated data |
| GL-03 | One codebase, two deployments (Iran, global), flags for each region's features; separate databases |
| GL-04 | A separate international domain (for example opetlife.com or .app) with the same brand |
| GL-05 | Target market: the general English-speaking public directly |
| GL-06 | Languages from day one: English, Persian, Arabic (Arabic and Persian are RTL) |
| GL-07 | A migrant user transfers their pet record to the global edition themselves, with an export and import file, at their own request and with their consent |
| GL-08 | Iranian vets give fully paid consultations to global users — **legal and sanctions risk; requires legal review before activation** |
| GL-09 | Tiers: Free + Plus (monthly and annual) + Family (up to 6 members, unlimited pets) |
| GL-10 | Free: one pet's record and QR card, vaccine and medication reminders, 10 AI messages a month, the first episode of every video course |
| GL-11 | Platform: web + iOS and Android apps from the start (Apple and Google in-app payment is mandatory) |
| GL-12 | Global vet consultation behind a country flag; off by default until each country's legal review |
| GL-13 | Content: translating the Persian content + localising the vaccine schedule and rules per country |
| GL-14 | Units automatic by country (kilogram or pound, Celsius or Fahrenheit) with a manual override |
| GL-15 | Global support: 24/7 AI chat + email with a 24-hour SLA; the same team with an English shift |
| GL-16 | A bilingual QR page with the scanner's language, on the global domain even for Iranian tags — **conflicts with GL-17; resolved in Chapter 2** |
| GL-17 | A separate global community; no user data is exchanged between the two editions |
| GL-18 | AI quota: Free 10, Plus 200, Family unlimited with fair use |
| GL-19 | Global launch 3 months after the Iranian edition stabilises and after the foreign company is registered |
| GL-20 | V-98 (Persian + English for all of Iran) applies only to the Iranian edition; the global edition is defined by GL-01 to GL-19 |

## Chapter 2 — Global pricing, payment, and currency

The global edition runs on Stripe and Apple/Google in-app purchase, has local and regional pricing, and no advertising. The Chapter 1 QR conflict is closed.

| Code | Decision |
| --- | --- |
| GP-01 | An Iranian tag goes to the Iranian domain and is bilingual there; a global tag goes to the global domain (replaces GL-16; consistent with GL-17) |
| GP-02 | Gateway: Stripe for web + Apple and Google in-app purchase for the apps; integration with RevenueCat |
| GP-03 | Base price: Plus $4.99/month / $39.99/year; Family $8.99 / $69.99 |
| GP-04 | Regional pricing based on purchasing power (PPP) with the app store's table |
| GP-05 | 14 free days of Plus with card registration; a reminder 3 days before it ends |
| GP-06 | Cancellation with one click; access until the end of the period; a yearly refund within the first 14 days |
| GP-07 | Taxes: Stripe Tax for web, Apple and Google for the apps; prices include tax in Europe |
| GP-08 | A user inside Iran is redirected to the Iranian edition; the global edition is not sold in Iran |
| GP-09 | A subscription bought on any platform is active everywhere; cancellation happens on the platform it was bought on |
| GP-10 | Gift cards of 3, 6, and 12 months from the web |
| GP-11 | Clinic and shelter packages: Plus for their customers with a volume discount + QR tags with their own branding |
| GP-12 | Physical global QR tags printed to partner demand; free with Family annual (the physical exception to GL-01) |
| GP-13 | Global consultation is paid with in-app credit (Stripe/IAP); settlement with the vet from the Iranian company in rial — **requires lawyer approval (sanctions)** |
| GP-14 | Consultation: $19.99 for a 24-hour message consultation; 30% off for Family |
| GP-15 | Display in the local currency with smooth rounding |
| GP-16 | The global edition has no advertising; revenue only from subscriptions and consultations |
| GP-17 | Renewal failure: a 7-day deadline with retries and email, then Free without deleting data |
| GP-18 | Return to Free: all data kept; extra pets become read-only; reminders only for the main pet |
| GP-19 | Global referral: one month of Plus for both parties after the first referred payment |
| GP-20 | A separate global dashboard: MRR, churn, LTV, Free→Plus conversion by country and platform; accounting separate from the Iranian ERP |

## Chapter 3 — Global legal, data, and localisation

Global data lives in Europe and follows GDPR; the two editions share only reference data and record transfer only happens at the user's own hand.

| Code | Decision |
| --- | --- |
| GC-01 | Global data hosting in Europe (Frankfurt) with a global CDN |
| GC-02 | GDPR minimums (legal default; the owner did not choose): an easy-dismiss cookie banner, data export and deletion from settings, versioned consent records, a public list of data subprocessors |
| GC-03 | User data is not used to train models; the AI provider has a no-retention contract; transparent notice in the privacy policy |
| GC-04 | Minimum 16 years for an independent account; children are only Family members with limited access and no community |
| GC-05 | The English legal text is the reference, reviewed by a lawyer in the company's country; translations are informational only |
| GC-06 | Under every AI health answer, a fixed "this is not a diagnosis" message + a button to find an emergency local vet |
| GC-07 | App store requirements from the start: in-app account deletion, Sign in with Apple, a privacy label, no external payment links |
| GC-08 | Global login: email (magic link) + Google + Apple; mobile optional |
| GC-09 | Translation: keys in the repository + a self-hosted translation panel (like Tolgee); AI draft + native human review; CI rejects untranslated keys |
| GC-10 | RTL and LTR with logical CSS properties, mirrored directional icons, a visual test of every page in both directions |
| GC-11 | Fonts: Vazirmatn (Persian), Inter (Latin), IBM Plex Sans Arabic (Arabic); all self-hosted |
| GC-12 | Gregorian calendar by default; Jalali optional for Persian speakers; reminders based on the user's time zone |
| GC-13 | A pet-entry checklist for 30 high-migration countries with countdowns, in both editions |
| GC-14 | Record transfer via a standard encrypted package that the user downloads and uploads themselves; the servers do not talk to each other |
| GC-15 | Reference data (FCI/TICA breeds, vaccines, medicines) named in every language, shared between the two editions |
| GC-16 | Global emergency: a map of 24-hour veterinary hospitals from public data + each country's animal poison centre number |
| GC-17 | A separate global backoffice on the global deployment; the same code; separate admin accounts |
| GC-18 | The same design system (UX-17) with images native to each market |
| GC-19 | Global SEO: landing and breed pages in three languages with hreflang, an English blog, app store optimisation |
| GC-20 | Global competitive advantage: a complete pet record with QR + an AI companion with record memory for the whole family |

## Chapter 4 — Information architecture

This chapter has an internal conflict: the pet-centric principle (IA-01) was chosen, but keeping the current menus and pages (IA-14, IA-18) and the absence of testing limit its execution. The conflict is resolved at the start of Chapter 5.

| Code | Decision |
| --- | --- |
| IA-01 | Pet-centric organising principle: every feature is reachable from the pet page; tabs are shortcuts |
| IA-02 | Services tab: a network of 8 high-use services (personal order by usage) + "all services" in 4 categories (health, care, travel, support) |
| IA-03 | The Me tab in 4 groups: activities; wallet and subscription; household and community; settings and support |
| IA-04 | Community and content live inside Home (lower section) + from the pet profile; no separate tab |
| IA-05 | A maximum of 3 clicks to every primary task, a maximum of 3 levels deep; breadcrumbs only on desktop |
| IA-06 | A floating "+" button on Home and the pet page: log weight, cost, symptom, memory, reminder |
| IA-07 | Features irrelevant to the pet's species are hidden; available in "all services" |
| IA-08 | Partner panels in the same app with a switcher, but independent task-driven navigation with a sidebar |
| IA-09 | An approved vocabulary for all panels and all three languages |
| IA-10 | Above the pet profile, a live status bar: next task, next appointment, open alert, order in transit |
| IA-11 | A single status label with a fixed colour and icon across all modules |
| IA-12 | A "my activities" page with all transactions and filters for type and status |
| IA-13 | No user testing of the information architecture |
| IA-14 | The page map stays as the current list |
| IA-15 | The current 332 pages are kept; no merging |
| IA-16 | Unified search also finds actions ("vaccine appointment", "log weight", "missing") |
| IA-17 | No cheap validation before the beta |
| IA-18 | The current menus are kept — **resolved by PD-01** |
| IA-19 | Clicking a notification opens the module's page (not a deep link to the task itself) — **resolved by PD-02** |
| IA-20 | An "all features" page in the Me tab with a one-line explanation and an example per module |

## Chapter 5 — Progressive disclosure and personalisation

Both Chapter 4 conflicts are closed. The interface is simplified by the user's stage, the pet's species, and the seller's size; user confusion is measured automatically (replacing the cheap user test).

| Code | Decision |
| --- | --- |
| PD-01 | The 5-tab bottom bar is primary; the current menus stay inside each tab; pages unchanged (resolves IA-18) |
| PD-02 | "My tasks" notifications go directly to the task; the rest go to the module's page (resolves IA-19) |
| PD-03 | Home is based on the user's stage: newcomer (complete the profile), active (today's tasks), no pet (selection guide) |
| PD-04 | Advanced features are only introduced when their moment arises |
| PD-05 | Forms only show required fields; the rest sits behind "more details"; pre-filled from existing data |
| PD-06 | A maximum of 3 suggestions on Home, always with a "because ..." reason, dismissible with "don't show this again" |
| PD-07 | Multi-pet: the active pet is the default; "all pets" for today's tasks and activities; a distinct colour per pet |
| PD-08 | The user picks their Home and services shortcuts; the core structure stays fixed |
| PD-09 | Content, shop, default reminders, and icons follow the active pet's species |
| PD-10 | After 30 days, tips and intros are hidden and the interface becomes more compact |
| PD-11 | Information is only asked when genuinely needed |
| PD-12 | Complex modules have a 3-sentence card + a 60-second video link on first entry |
| PD-13 | The seller panel is sized by the seller: simple view (orders, stock, payouts) or full view (team and reports); switchable |
| PD-14 | Customer language without technical or financial jargon ("payout" not "settlement"); a ninth-grade reading level |
| PD-15 | Every choice has one pre-selected option labelled "recommended" |
| PD-16 | Non-financial work has a 10-second undo; financial work has a clear confirmation screen |
| PD-17 | An "ask the assistant" button on complex pages; the AI takes the user to the right page or fills the form |
| PD-18 | Optional "simple" mode: larger font, 4 primary tasks, no community |
| PD-19 | Confusion events in analytics (repeated back-and-forth, fruitless searches, form abandonment) with a weekly report |
| PD-20 | A "was this page confusing?" button with automatic page and path recording |

## Chapter 6 — Design system and consistency

Consistency comes from a shared component library and 6 page templates. The decision to redesign the current pages is suspended until a visual sample of 6 key pages is seen.

| Code | Decision |
| --- | --- |
| DS-01 | Shared component library (packages/ui) + tokens; no page has bespoke styling; CI rejects hardcoded values |
| DS-02 | 6 page templates: list, detail, multi-step form, dashboard, timeline, result/success; all pages build on these |
| DS-03 | Colour for meaning: green success, amber warning, red danger and emergency, blue informational; brand colour only for the primary action |
| DS-04 | Each category (health, care, shop, travel, support) has one icon and a small accent colour; not a different look |
| DS-05 | One card component with fixed slots (image, title, meta, status, action) for all objects |
| DS-06 | 5 mandatory page states: loading (skeleton), empty, error, offline, no access |
| DS-07 | One primary button per page; on mobile it is sticky at the bottom in the thumb zone |
| DS-08 | Icon set (such as Lucide) + 20 custom pet icons in the same style |
| DS-09 | 6 text sizes (12, 14, 16, 20, 24, 32); body 16; line height 1.7 for Persian |
| DS-10 | 4/8 pixel grid; minimum 44 touch target; 16 card radius |
| DS-11 | The user's real pet photos wherever possible; empty places use stock photos in a consistent style |
| DS-12 | Storybook with all components in three languages and two themes; an automated visual test in CI |
| DS-13 | The redesign of 332 pages is suspended until the visual sample (DS-17) is approved |
| DS-14 | A complete dark theme with separate tokens; AA contrast in both |
| DS-15 | One chart library with a consistent style; Persian numerals and RTL |
| DS-16 | The same system, a compact version for the backoffice and partner panels: data tables, filters, bulk actions |
| DS-17 | After these 300 questions and before coding: the 6 key pages (Home, pet profile, product, booking, seller dashboard, backoffice work desk) are designed with the new system and approved |
| DS-18 | Several happier palettes side by side in the sample for selection |
| DS-19 | Standard animations: page entry, success confirmation, and a touch shake for important actions |
| DS-20 | One named owner for the design system; a new component only with that owner's approval, not by every prompt |

## Chapter 7 — Critical journeys and friction

The most frequent tasks take at most 2 taps, emergency and lost pet are reachable without opening the app, and every task ends with "what happens next".

| Code | Decision |
| --- | --- |
| JR-01 | Time to first value (QR card + vaccine reminder) under 2 minutes from install |
| JR-02 | Re-buying the same food in 2 taps from Home or a notification |
| JR-03 | "Same slot as last time": one tap with the same provider, service, and pet; only the time is chosen |
| JR-04 | A red emergency button in the pet status bar and a lock-screen widget, without signing in |
| JR-05 | A "my pet is missing" widget with one tap and the current location pre-filled |
| JR-06 | A "given" tick straight from the notification, without opening the app |
| JR-07 | At the clinic: "show to the vet" with a full-screen summary or a 72-hour sharing QR |
| JR-08 | Vaccine history with the simple question "has your pet had this vaccine? when?" from the species's standard list |
| JR-09 | The seller's daily tasks on mobile take at most 2 taps; scan a barcode for the tracking code |
| JR-10 | Provider: "start service" and "end with a photo" on today's appointment card; a report with a ready template and audio |
| JR-11 | Receipt review: photo and AI data next to the order amount; confirm with a shortcut; the next one is automatic; target under 15 seconds |
| JR-12 | "Something went wrong?" on every order and booking with 4 common options that open the right path |
| JR-13 | After every completed task, a result page with "what happens next" and at most 2 next actions |
| JR-14 | A half-finished form is auto-drafted and shown on Home as "continue" |
| JR-15 | Signing in mid-task returns to exactly the same place with the same data after the OTP |
| JR-16 | A direct SMS link to the exact item with a secure one-time pass valid for 15 minutes for low-risk tasks; financial tasks still use OTP |
| JR-17 | For 10 core journeys, tap count and time targets are defined and measured in analytics |
| JR-18 | At most one non-essential pop-up per session; never mid-task |
| JR-19 | A subscription offer only appears when a real limit is reached; no permanent banner |
| JR-20 | 3 errors or back-steps in one stage → offer "would you like help?" with chat or a call |

## Chapter 8 — Order and booking lifecycle: the edges

Every state and transition is documented in an official state machine; partial, concurrent, and late cases have an explicit rule.

| Code | Decision |
| --- | --- |
| OF-01 | An official state machine for order, parcel, booking, payment, and return: allowed transitions, allowed role, side effect — in the technical document |
| OF-02 | Order status is derived from the parcels ("partially shipped", "partially cancelled"); each parcel returns independently |
| OF-03 | Cancelling a part that would drop the cart below the free-shipping threshold does not reduce the shipping cost in the refund |
| OF-04 | Discounts are distributed proportionally by amount; a partial refund = the amount actually paid for that item; the code is not returned |
| OF-05 | With a return, the pawma and cashback of that item are clawed back; if already spent it is deducted from the refund |
| OF-06 | Pawma become spendable after the return window ends (48 hours after delivery) |
| OF-07 | The price at payment time is locked; a price change only applies to a new booking; a repeat booking is notified 7 days ahead |
| OF-08 | The provider taps "running late"; more than 30 minutes late = the customer can cancel with a full refund + a warning |
| OF-09 | Objecting to "completed" within 24 hours; settlement is held; evidence (GPS, end photo) is examined; support decides |
| OF-10 | Booking confirmation deadline 2 working hours (an immediate slot 30 minutes); then automatic rejection + BK-06 |
| OF-11 | A card-to-card booking only if the slot is more than 24 hours away (the slot is held until the receipt is reviewed); otherwise card-to-card is disabled (resolves the T-21 conflict with a near booking) |
| OF-12 | Wrong item: a report with a photo → the seller has 24 hours; correct dispatch at their own cost or a full refund; the customer chooses |
| OF-13 | Stock is only reserved when the payment starts (15 minutes), not in the cart; the last number wins with a transactional lock |
| OF-14 | The slot time is held during the confirmation deadline; a second request cannot take the same time |
| OF-15 | A seller closure (SL-06) is not possible with an open order; either dispatch or cancel with a reason |
| OF-16 | A repeat purchase with a closed seller: automatic substitution as in SH-11, or ask the customer |
| OF-17 | When a pet's death is recorded, a "with pet" ticket is also cancelled with a full refund, even after the 48-hour deadline |
| OF-18 | Event cancellation: an automatic full refund to everyone's wallet + SMS; an organiser warning if less than 72 hours ahead |
| OF-19 | The Alopeyk courier found no one or cancelled: re-request; 2 failures = seller dispatch; the price difference is with OptLife |
| OF-20 | Address change up to dispatch (same city, with a price difference); after dispatch only via chat with the courier |

## Chapter 9 — Financial edges

Every money movement is recorded in an immutable double-entry ledger and a mistake is only compensated by a correcting transaction. Commission is not returned on a return, except when the platform is at fault.

| Code | Decision |
| --- | --- |
| FE-01 | A mixed payment is refunded to the same source: the wallet portion to the same balance type; the gateway portion to the withdrawable balance |
| FE-02 | Spent gift credit that expires during a return is extended by 30 days |
| FE-03 | A return or objection after settlement: the customer waits for the seller (OptLife does not advance the money) |
| FE-04 | Bank chargeback: the order is suspended and dispatch stops; if already shipped, a user debt + a risk label (A-04) |
| FE-05 | A refund always goes to the wallet of whoever paid, even for a shared household pet |
| FE-06 | The wallet is personal only; the owner can allow a member to spend from their wallet with a monthly cap |
| FE-07 | The subscription belongs to the household; the payer is the financial owner; if they leave, the subscription lasts to the end of the period and does not renew |
| FE-08 | Upgrading a subscription is immediate with a relative payment; a downgrade takes effect next period |
| FE-09 | A reward is only released by the owner's decision |
| FE-10 | Seller suspension: delivered undisputed orders are settled; the rest are held until the return window ends, except in fraud (SL-17) |
| FE-11 | The 7% commission is not returned on a return |
| FE-12 | Exception: if OptLife or the platform courier is at fault (O-05), the commission is returned |
| FE-13 | The CPC click cost is not returned on a return |
| FE-14 | All amounts are integer rial; the discount split gives the largest remainder to the last item; the total is always exact |
| FE-15 | An immutable double-entry ledger for every money movement; balances are computed from the ledger |
| FE-16 | A financial mistake is corrected only by a correcting transaction with a reason and second-person approval; never by a direct edit |
| FE-17 | Ticket money reaches the organiser only after the event (no advance) |
| FE-18 | Shelter suspension: monthly donations stop; contributors are asked about a transfer or an end; unsettled balance is held |
| FE-19 | OptLife issues a formal monthly commission invoice; sales are declared with the seller; a sales report is provided to the Moudiyan system |
| FE-20 | An idle wallet stays as it is |

## Chapter 10 — Identity, household, and pet transfer

Every pet has exactly one primary owner and the household only grants access; transfer, separation, death, and account merging have a defined path.

| Code | Decision |
| --- | --- |
| ID-01 | Every pet has exactly one primary owner; the household only grants access; ownership transfer needs both parties' approval |
| ID-02 | Household separation: the primary owner takes the pet; the separated member keeps a read-only copy of the memories they recorded |
| ID-03 | Ownership dispute: OptLife does not judge; the registered owner stays until an official ruling or a written agreement |
| ID-04 | Owner's death: with a report and evidence, ownership is transferred to an adult household member or a nominated "pet heir"; the account enters a memorial state (distinct from account deletion in A-03) |
| ID-05 | Transferring a pet to another user without adoption: invitation and approval; the health record goes, the memories by the previous owner's choice, the costs do not |
| ID-06 | Bookings, subscriptions, and reminders move with the pet |
| ID-07 | The payer of recurring items transfers to the new owner; it is suspended until their approval |
| ID-08 | Merging two accounts with an OTP on both numbers; pets and wallets transfer; partner roles are migrated manually with support |
| ID-09 | A number inactive for 6 months: sign in again with a security question (the pet's name) or a new account with no access to the previous data |
| ID-10 | The shop belongs to the organisation; transferring organisation ownership needs both parties' approval and re-vetting |
| ID-11 | A shop employee does not confirm, review, or return their own orders |
| ID-12 | A user belongs to several households; switching uses the pet avatars |
| ID-13 | A pet only stays in the primary owner's household; external access is only temporary (ON-11) |
| ID-14 | Subscription benefits only apply in a household with a subscription |
| ID-15 | "Verified account" = a verified mobile number only (so the verification requirement in CM-08 and CM-19 adds no extra restriction) |
| ID-16 | A free display name in the community; the real name only for invoices and shipping; the pet's name by default ("Lulu and family") |
| ID-17 | A seller does not buy from their own shop and does not buy clicks on their own products |
| ID-18 | Under 18: no independent account, purchase, wallet, or community; only a household member of a parent with the "carer" role |
| ID-19 | At an elderly user's request, a member with the "partner owner" role places orders and bookings for them |
| ID-20 | "Neighbourhood pet": a stray with several carers and no owner, with a vaccine and neutering record |
| ID-21 | The household owner controls invitations and removal of members from that household. A user may belong to several households at once. Invitations use the phone number and a unique, secret, expiring, revocable, single-use link. After signing in or registering with the invited number, the recipient may only request membership; the owner must explicitly approve. Matching numbers does not prove phone ownership, and this phase sends no SMS/email verification or marks a phone verified. No household, pet or health data/access is exposed before approval. Removing a member revokes only that household's membership and access. This supplements ON-09 and ID-12 and does not change the account-verification definition in ID-15. |

## Chapter 11 — Cross-module transfers

Side effects between modules are managed with an event centre and an impact table for 10 key events; this is the direct answer to "nested flows".

| Code | Decision |
| --- | --- |
| XM-01 | Prescription → cart with matched items → payment → medication reminder from the delivery day; scarce items via "product request" |
| XM-02 | Lost until found: matching → anonymous chat → proof with the hidden marker → handover → "found" → reward + closing both ads + a public thank-you |
| XM-03 | After adoption: the pet with its health record goes to the new household + a "new pet" onboarding (QR, next vaccine, purchase checklist) |
| XM-04 | Emergency detected in a consultation or AI triage: a text message only — **safety risk; JR-04 (a permanent emergency button) is the only cover** |
| XM-05 | A service report goes to the pet's timeline, the cost to the costs, a good photo is suggested for the memories |
| XM-06 | Travel checklists connect to real tasks: tests → booking, crate → shop, advice → X-05 |
| XM-07 | A medication reminder during boarding passes to the boarding; the boarding tick notifies the owner |
| XM-08 | A "with pet" ticket checks the vaccine requirement automatically from the record; incomplete = the BK-05 path |
| XM-09 | Event centre (event bus): modules publish events and the rest listen; the list is in the technical document |
| XM-10 | A complete impact table for 10 key events (pet death, pet transfer, account deletion, seller suspension, disappearance, adoption, subscription cancellation, …) across all modules |
| XM-11 | Account deletion is not possible with an open order, booking, or subscription; show the open items + cancel everything + withdraw the balance |
| XM-12 | A shop owner's account is never deleted (Iranian edition only; the global edition has no sellers, so GC-07 is not violated) |
| XM-13 | A vaccine recorded at the clinic: the record with a confirmed label, a next-appointment reminder, closing the previous reminder, and the QR card updated |
| XM-14 | Prescription therapeutic food: "suitable for my pet" is updated, the previous food gets a warning, and a change to the repeat-purchase subscription is suggested |
| XM-15 | Weight from every source with a source label in the chart; the vet has display priority; the basis for PT-16 |
| XM-16 | A virtual foster has first priority to adopt that same animal and is notified |
| XM-17 | A neighbourhood pet is adopted or moved to a shelter with the majority of carers' approval; the record goes with it |
| XM-18 | The AI companion only suggests and takes the user to the right page; it never performs an action (replaces the action part of V-59 and the form filling of PD-17) |
| XM-19 | AI access: all of the user's own data; per Claude's proposal except the vet's private notes (for compatibility with VT-17) — **requires owner approval** |
| XM-20 | Virtual fostering and the neighbourhood pet are connected to the shelter and adoption (XM-16, XM-17) |

## Chapter 12 — Seller and provider organisation

Every partner is an organisation (even a one-person one); roles, employees, statuses, and conflicts of interest have a defined path. XM-19 is made final by the owner's approval.

| Code | Decision |
| --- | --- |
| OR-01 | AI access: all of the user's data except the vet's private notes (XM-19 is final) |
| OR-02 | Ready organisation roles: owner, manager, storekeeper, accountant, service staff, message responder; IBAN and settlement only for the owner |
| OR-03 | The service rating goes to both the organisation and the employee; the personal rating moves with the employee |
| OR-04 | An individual partner is a one-person organisation with the same data model and a simpler interface |
| OR-05 | A multi-organisation employee has a shared personal calendar with conflict prevention |
| OR-06 | Employees in contact with the pet or the customer's home (dog walker, mobile groomer, courier) have the individual B-06 vetting |
| OR-07 | The settlement IBAN is in the name of the individual owner or the legal entity, verified with F-12; never an employee |
| OR-08 | One IBAN per organisation, with sales reported by branch; a separate IBAN only for a franchise |
| OR-09 | A dismissed employee: access is cut immediately; future appointments are informed to the customer with another employee or cancelled with a full refund |
| OR-10 | Taking customers off-platform is forbidden in the terms + chat filter; a customer report = a warning |
| OR-11 | A partner can record their own in-person customer in the calendar (a manual block) with no commission |
| OR-12 | A clinic can be a medicine seller; the vet does not steer the customer to their own shop; on par with the rest in VT-03 |
| OR-13 | CPC only for shops; services are commission only at 7% |
| OR-14 | Veterinary: 7% for the visit, the consultation, and the supplementary invoice of clinical procedures |
| OR-15 | Premium partner subscription: advanced reports, more users, branded shop, API; the price is in the backoffice |
| OR-16 | A dedicated account manager for 50 large organisations; the rest go to the partner support queue |
| OR-17 | Organisation statuses: draft → in review → needs correction → active → temporarily closed / suspended / exiting → closed; the effect of each status is documented |
| OR-18 | Organisational suspension: products and services are hidden immediately; paid orders are fulfilled or cancelled with a refund; reviews are kept |
| OR-19 | A versioned catalogue; earlier orders keep the specifications at the moment of purchase |
| OR-20 | Admin merges duplicate products: the offers, reviews, and statistics move to the main product; the old link redirects |

## Chapter 13 — Backoffice exceptions

Every automated decision can be overturned by a human, every external service has a failure procedure, and genuinely urgent work reaches the on-call supervisor even at night.

| Code | Decision |
| --- | --- |
| EX-01 | Every automated decision has an "undo decision" button with a reason and an audit entry |
| EX-02 | A policy exception by an operator with a reason and a monthly cap; the cost comes from the customer-satisfaction budget, not the seller |
| EX-03 | One support decision-review request; another supervisor makes the final decision within 3 working days |
| EX-04 | A single dispute file with all parties, the evidence, and the chat in one place, a response deadline per party, and a liability split |
| EX-05 | A failure procedure for every external service: the signal, the disable switch, the alternative path, the user message, and the recovery of pending items |
| EX-06 | An official holiday calendar in the backoffice; deadlines extend automatically after holidays |
| EX-07 | A daily order capacity per campaign; beyond it the automatic dispatch time is pushed back (without an unfair delay warning) |
| EX-08 | An obviously wrong price: a warning at entry; if sold, cancellation within 24 hours with a full refund + compensation code from the seller's share |
| EX-09 | Security incident procedure: the emergency switch, the responsible team, notification to the affected people within 72 hours, and a post-incident report |
| EX-10 | A judicial authority's data request only with an official letter, lawyer and superadmin approval, minimum data, and a log entry |
| EX-11 | An automatic rule against referral and gift abuse (several accounts with one device or IBAN, mutual referrals); the reward is held until review |
| EX-12 | "Hide immediately" content for moderators without approval; reviewed later |
| EX-13 | Every schema change has a migration script and a rollback, a trial run on a copy of real data in staging, and a report of corrected records |
| EX-14 | All test data is wiped before release; beta users are kept |
| EX-15 | A weekly human review of a random 5% of AI decisions; the error rate in the dashboard |
| EX-16 | A monthly report of exceptions, overrides, and compensatory credit per operator |
| EX-17 | Urgent work outside working hours (lost pet, service incident, emergency) goes to the on-call supervisor's Bele |
| EX-18 | Service incident report: an immediate call to the on-call supervisor, guidance to the on-call clinic, notification to the owner, the BK-15 file |
| EX-19 | A pet lost during a service: an automatic lost ad with the last GPS, without the 2-hour approval deadline; the provider stays in the file until the search ends |
| EX-20 | Every core process (receipt, return, vetting, content, lost pet, settlement) has a role owner responsible for the queue, the SLA, and the procedure |

## Chapter 14 — Idealism: the next generation

All features in this chapter ship with the release; partner-dependent features are behind a flag and are activated after a contract.

| Code | Decision |
| --- | --- |
| NX-01 | A pet health score (0 to 100) from weight, vaccines, activity, and symptoms with a suggestion for improvement |
| NX-02 | A breed disease risk alert based on age |
| NX-03 | AI image analysis (skin, eyes, teeth) only to suggest a visit, not to diagnose |
| NX-04 | Behaviour change detection from the journal and a tracker |
| NX-05 | "The pet's life story": an emotional timeline auto-generated from milestones |
| NX-06 | A shared family dashboard (a digital fridge board or tablet) |
| NX-07 | Partners (behind a flag until a contract): municipality (pet parks, street neutering), pet blood bank, national microchip registry, veterinary universities (anonymous research data with consent) |
| NX-08 | New services (behind a flag until a contract): dedicated pet insurance priced from the record, large instalment medical plans; and without a partner: home boarding, live online training with a trainer |
| NX-09 | Personal plans: personal food with calorie calculation, exercise matched to breed and climate, step-by-step behaviour training, weather alerts |
| NX-10 | Social: 24-hour stories, shareable badges and achievements, breed clubs, peer mentoring |
| NX-11 | Partner tools: seasonal demand forecasting, product suggestions from unanswered demand, full clinic SaaS, a next-visit reminder for partner customers (only a service reminder through OptLife notification, within the NT-04 cap; consistent with NT-19) |
| NX-12 | Smart backoffice: queue volume forecasting, fake review network detection, partner and customer churn risk, an AI weekly management summary |
| NX-13 | Humanitarian: a pet food bank for low-income people, "pet in crisis" (temporary shelter), a public annual impact report |
| NX-14 | Natural disaster mode in the backoffice: an emergency shelter map, regional alerts, prioritised lost pets, an instant aid campaign |
| NX-15 | Ageing and end of life: a quality-of-life guide, at-home vet, burial and cremation with vetted partners, grief support |
| NX-16 | Pet life stages (puppy, young, adult, senior) with automatic changes to content, reminders, food, and check-ups |
| NX-17 | Emerging technologies are not now; after the release, with real data |
| NX-18 | An "open health record": a standard importable and exportable format; the user owns the data (the same format as GC-14) |
| NX-19 | A "responsible owner" badge after 5 years of a complete record: an insurance discount (with a partner), priority in adoption; an annual anonymous "health of Iranian pets" index (consistent with T-14) |
| NX-20 | All features of this chapter ship with the release; an internal roadmap; A/B infrastructure on flags for UX and pricing decisions |

## Chapter 15 — Preparing the work division

The work is divided by domain with a fixed owner; the shared core first, then the modules in parallel, and the global edition last. The immediately next order: design the 6 pages → the prompt map → the P0 text.

| Code | Decision |
| --- | --- |
| WB-01 | Division by domain (payment, order, booking, record, backoffice, …) with a fixed owner; each domain has several module prompts |
| WB-02 | Phases: 0) repository, environments, visual sample ← 1) core (state machine, ledger, event centre, design system) ← 2) payments and backoffice ← 3) modules in parallel ← 4) global edition |
| WB-03 | Execution: Codex and Claude Code in parallel + one human developer as reviewer and integrator |
| WB-04 | Definition of done for each prompt: document code coverage, green E2E, 5 page states, three languages, an updated technical document, screenshot evidence |
| WB-05 | Progress tracked in this chat + a table inside the decision document |
| WB-06 | The technical document is written alongside the code (not before it) |
| WB-07 | An estimate of each prompt's size (S/M/L/XL) and the phase timetable in the prompt map |
| WB-08 | A decision change during development only with a new code + a review of the impact on the executed prompts; from phase 3 only critical changes |
| WB-09 | P0: resolve PR 59's conflict, main as the default branch, three environments (TC-04); **without** wiping test data (that happens at release time, EX-14) |
| WB-10 | Claude designs the 6-page visual sample; after approval, the tokens and components enter packages/ui |
| WB-11 | Prompts in English; the Persian interface text verbatim in the prompt |
| WB-12 | The Markdown version of the document in docs/decisions.md inside the repository; every change is synced |
| WB-13 | The quality of each phase is measured only by automated tests (without an independent review) |
| WB-14 | Phase 3 order: record and health ← shop and seller ← services and veterinary ← lost, adoption, support ← community and events ← next generation |
| WB-15 | After each phase a decision point with the owner: show the result, the deviations, and approve the next phase |
| WB-16 | Design system owner (DS-20): Pedram |
| WB-17 | Next order: 1) design the 6 pages 2) the complete prompt map with sizes and dependencies 3) the P0 text |
| WB-18 | Country and partner flags (GL-12, NX-07, NX-08) are part of phase 1 so that modules are built behind them |
| WB-19 | The key event impact table (XM-10) and the state machine (OF-01) are written and implemented in phase 1 |
| WB-20 | The global edition (phase 4) only starts after the foreign company is registered and GL-08 is legally reviewed |

## Owner's supplementary product decisions

| Code | Decision | Effect on earlier decisions |
| --- | --- | --- |
| PL-01 | Complete the pet-product catalogue using Digikala information. Admins can provide a product, listing or category URL to retrieve available name, brand, specifications, description, primary image and gallery; the result is a simple product in the OptLife catalogue | Complements C and SH decisions |
| PL-02 | Import prioritizes completeness, descriptions and brand information. Digikala prices and stock are not the goal and must not be presented as OptLife seller prices or stock | Complements PL-01 and separates catalogue content from seller offers |
| PL-03 | Add pet-friendly accommodation information from either Jajiga or Jabama; the final source was initially undecided. Refresh retrievable prices and capacity/availability once daily and send users to the same accommodation's source page to book. Show the update time; final results depend on the source site | Complements travel and pet-friendly accommodation decisions |
| PL-04 | Remove the lock on redesigning the whole landing page. Complete it as a polished product, but do not change the current hero section; other landing sections may change | Replaces the full-landing lock in UX-17 and BO-16 only for the landing; the hero remains protected |
| PL-05 | Add a public memorial section to the landing: when a pet owner reports that their pet "has joined the angels", small slides may show the pet's name and image to all users | Complements U-01; does not remove the separate memorial page |
| PL-06 | The landing includes partner invitations, public articles, a short introduction to OptLife and attractive entry points to the site's sections | Completes landing content consistently with PL-04 |
| PL-07 | Product languages are Persian, English, German and Spanish; Arabic is removed from the target set. Apply this to interface, content, translation needs and tests | Replaces the language set in GL-06, GC-19, IA-09, DS-12 and WB-04; other principles remain |
| PL-08 | Design all site pages using the owner's identified design reference, except that the current landing hero remains unchanged. Do not guess the reference content before it is accessible and inspected | Complements DS-01 through DS-20 and PL-04 |
| PL-09 | Sellers select a product from the central catalogue and create their own offer for it. If the product is genuinely absent, the seller requests its addition; an admin checks for missing/duplicate products and adds an approved new product to the catalogue | Complements PL-01/02 and the seller catalogue flow |
| PL-10 | Jajiga is the selected source for pet-friendly accommodation. Retrieve and refresh available information daily and link to the same Jajiga accommodation as specified by PL-03 | Resolves the source choice left open in PL-03 |
| PL-11 | The visual design boards supplied by the owner are the reference for all product pages, except that the current landing hero is preserved. The implementable summary is in [the design reference](design/product-design-reference.md). Most images are in the repository and linked there; the separate shop image and emergency images supplied in the latest round have not yet been identified in that folder. Do not infer visual details from unavailable references | Complements PL-08; images were seen in the conversation, but unseen details must not be guessed |
| PL-12 | In addition to light/dark themes, language switching and responsive design, provide an optional "simplified display" for any user, including users who prefer less clutter. Keep essential information and functionality available and allow users to return to the normal display. This mode is independent of theme and language | Complements DS and PL-07 |

## Round Two Summary

**300 decisions in 15 chapters** (GL, GP, GC, IA, PD, DS, JR, OF, FE, ID, XM, OR, EX, NX, WB). The document's total: 734 decisions and features.

**Conflicts resolved in this round:** GL-16 with GP-01; IA-18 with PD-01; IA-19 with PD-02; T-21 with a near booking (OF-11); XM-19 with VT-17 (OR-01); XM-12 with GC-07 (the global edition has no sellers).

**Decisions that were replaced:** V-59 and PD-17 (the action part) ← XM-18; AD-02 ← BO-02; M-05 (upload) ← CM-11.

**Open risks the owner knowingly accepted:**
1. GL-08 and GP-13: Iranian vet consultations for global users and settlement from the Iranian company — a licence and sanctions risk; behind a country flag, off until legal review.
2. IA-13 and IA-17: no user testing; compensated by PD-19, PD-20, JR-17, and A/B (NX-20).
3. XM-04: emergency detection only by text; covered by JR-04.
4. FE-11: commission is not returned on a return (except FE-12) — a negative effect on seller acquisition.
5. ID-15: "verified" = mobile only; the verification requirement in the community and play dates is effectively meaningless.
6. NX-20: all next-generation features ship with the release; the first release's scope is very large; partner features behind flags.
7. WB-13: quality only by automated tests; no independent review.

## Applied defaults and risks

These rules were added to close gaps directly in the decisions and apply until the owner explicitly
rejects them in the prompts.

| Code | Default or risk | Why |
| --- | --- | --- |
| P-01 | Minimum CPC filter: a bot click, the seller's own click, and a repeated click from one device on one product within 30 seconds are not charged | Without the filter F-10 lets a competitor drain the seller's credit |
| P-02 | Every external service has a manual alternative path: Alopeyk API down → seller dispatch only; IBAN verification down → manual review; no Zibal settlement API → a PAya file | Prevents the purchase flow from stopping |
| P-03 | All new modules are built behind a feature flag and switched on together on release day | Keeps AD-16 consistent with the closed beta and the real-money test |
| P-04 | SMS and timed queues are counted against the AD-06 "working hours", except F-04 and M-09 which are 24-hour | A single definition of deadlines |
| R-01 | Human load: F-04 (24-hour receipt), M-07 and M-08 (review and community pre-review), M-09, S-07, and X-02 need night and Friday shifts | With AD-06 working hours the queues fill up at night and at weekends |
| R-02 | B-03 (full refund before the start) burns the provider's capacity for boarding | May make provider recruitment harder |
| R-03 | O-03 makes checkout dependent on Alopeyk's live API | P-02 is its replacement |
| R-04 | AD-03 makes operators depend on AD-04 for calls | Not every call can happen without an open file |

Modules with no base in the current code and built from scratch: events and tickets (M-01 to M-04),
wallet and withdrawal (F-11, F-12), card-to-card (F-03), CPC and top-up (S-01 to S-03), digital
contract (S-04), deposit (S-10), Excel upload (C-04), seller score and warnings (S-11, S-15), the SMS
template panel (AD-13), the single operations queue (X-02), the payment-method switch (F-16), the
adoption questionnaire (M-11), the NGO usage report (M-13).

## Open questions

- [ ] Does Zibal offer an automatic settlement API (tej)?
- [ ] What is the first release campaign? (GR-20)
- [ ] Is a query to the Veterinary Organisation required for online consultation and prescriptions?
- [x] Closed (T-01): how many toman is the flat CPC click rate? (F-10)
- [x] Closed (T-02): what is the refund amount threshold requiring second-person approval? (F-15)
- [x] Closed (T-03): is P-01 (the minimum CPC filter) approved or rejected?
- [x] Closed (T-21): are night and holiday shifts for finance and content defined? (R-01)
- [ ] Half-open (T-04, configurable): what is the monthly and annual household subscription price and the annual discount percentage? (U-05)
- [ ] Half-open (ER-01): does the accountant confirm the chart of accounts and the event→document map? (E-05)
