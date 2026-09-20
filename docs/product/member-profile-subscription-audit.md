# Member profile and PET LIFE Care audit

## Decision

Extend the existing H16 subscription system, H17 medical record, H10 notifications, H07 household/pet access, care calendar, and memories modules. No parallel billing, medical record, media, or notification system will be created.

The product will offer one consumer membership, **PET LIFE Care**, with 1, 3, 6, and 12 month prices. A new eligible household can explicitly activate a seven-day trial after the first pet exists. The system will not claim automatic renewal unless the selected payment adapter exposes a verified recurring-payment capability.

## Existing implementation

| Area | Current source of truth | Assessment |
| --- | --- | --- |
| Subscription lifecycle | `Subscription`, periods, trials, changes, billing attempts | Strong state machine already supports trialing, active, past due, grace, cancel-at-period-end, cancelled, expired, and reactivation |
| Plans and pricing | `SubscriptionPlan`, append-only `SubscriptionPlanPrice`, entitlements | Reusable; only monthly and annual intervals exist today |
| Entitlements | `EntitlementService`, usage service, overrides | Correct foundation; product actions must ask this service rather than inspect plan names |
| Trial | explicit `/subscription/trial` action | Correct low-friction trigger, but seed data currently uses 14 days and must become 7 |
| Consumer UI | `/subscription`, `/subscription/plans` | Functional management UI; needs conversion hierarchy, four durations, honest renewal copy, value proof, and contextual expired state |
| Admin | plan, price, entitlement, household and billing-attempt endpoints | Strong operational base; complimentary grants, extensions, campaigns/promotions and analytics are missing |
| Pet profile | `/pets/[id]` plus health, care, memories, travel | Core routes exist; overview needs attention/upcoming/activity/memory hierarchy and shared profile navigation |
| Health | H17 clinical aggregation and H20 signed documents | Reuse; preserve provenance and `UNKNOWN != NORMAL` semantics |
| Care | care profile and aggregate care calendar | There is no first-class reminder engine; typed reminders, state transitions, recurrence and deep links are a real gap |
| Memories | CRUD, filters, archive/restore, signed private media, timeline | Strong base; gallery/calendar/highlights/On This Day, draft protection and subscription creation limits remain |
| Notifications | H10 in-app/SMS/email preferences and deep-link utilities | Reuse; add care and membership events without medical content in logs or outbound copy |
| Account | `/account`, orders, bookings, support, subscription | Equivalent pages exist but no coherent `/profile` overview/activity information architecture |

## Competitive product findings

- PetDesk keeps appointments, reminders, and health records close to the pet identity and makes records shareable to a trusted care provider. PET LIFE should retain pet context across every care action and show provenance before sharing.
- Pawp organizes the member experience into Care, My Pets, protection/membership, and Account. PET LIFE should sell ongoing organization and follow-through, without claiming clinical diagnosis or copying telehealth benefits it does not provide.
- Day One makes journaling quick, private, searchable, photo-rich, and resilient to interruption. PET LIFE Memories should default to household-private, preserve drafts, and surface real past entries through On This Day.
- Modern subscription systems separate product, prices, trials, discounts, entitlements, and lifecycle. PET LIFE already follows most of this model; durations belong in price rows, while grants and promotions need explicit attribution and audit.

Sources: [PetDesk pet-parent guide](https://info.petdesk.com/hubfs/Customer%20Success%20Assets/PetDesk%20Branding/How%20to%20Use%20Your%20PetDesk%20App%20A%20step-by-step%20guide%20for%20pet%20parents%21%20%2811%20x%208.5%20in%29.pdf), [Pawp app navigation](https://help.pawp.com/en/articles/6950849-how-to-use-the-pawp-mobile-app), [Pawp membership](https://help.pawp.com/en/articles/7153880-what-is-pawp), [Day One encryption](https://dayoneapp.com/wp-content/uploads/2026/03/day-one-end-to-end-encryption-1.pdf), [Stripe Billing features](https://stripe.com/billing/features).

## Locked free and paid boundary

Always readable after expiry: Home, pet identity/profile, historical health data, existing documents, existing memories, past orders/bookings/payments, commerce discovery and purchasing, and provider service discovery.

Entitlement-gated create/manage actions: advanced owner-created health organization, advanced reminders and automation, extended care calendar, premium document/media storage, and memory creation beyond the free allowance. An expired action opens contextual membership value and plans; it never replaces the whole page with a blank paywall.

## Delivery batches

1. Align seven-day trial, add 1/3/6/12 month price intervals, document entitlement policy.
2. Add profile overview/activity routes and strengthen pet overview information hierarchy.
3. Implement typed Care Reminder persistence, API, lifecycle actions, recurrence, source provenance and notification deep links.
4. Polish health aggregation and provenance without changing clinical truth.
5. Finish Memories browsing, draft protection and entitlement limits.
6. Aggregate account activity by reference to source records; do not duplicate financial truth.
7. Rebuild subscription sales UX around tangible value, duration and honest payment behavior.
8. Add audited complimentary access, extensions, promotions/campaigns and price management.
9. Add DB-derived subscription analytics, lifecycle notifications, demo data, security and live acceptance checks.

Each substantial batch is built, tested, pushed to `integration/local`, automatically deployed, health-checked, and smoke-tested before the next batch is reported complete.
