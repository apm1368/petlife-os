# PET LIFE OS navigation architecture

## Global hierarchy

Desktop uses six stable destinations and compact utilities:

1. **Home** — public landing for visitors, consumer dashboard for signed-in users.
2. **Explore** — Health & Vet, Services, Places, Travel, Insurance, Animal Support, Community, and Guides.
3. **Health** — active-pet health summary; public users enter vet discovery.
4. **Services** — service categories and providers.
5. **Shop** — curated shop hub and catalogue.
6. **Memories** — active-pet memories for signed-in users; visitors are handed to sign-in with `returnTo`.

Utilities are locale, theme, notifications where authenticated, and account/open-app. Cart belongs to Shop context and account operations live in the consumer navigation, not the global discovery row.

Mobile uses the same hierarchy in a sheet. Targets are at least 44px high, the active destination uses `aria-current`, the sheet closes after navigation, and the document direction follows locale (`fa`/`ar` RTL, `en` LTR).

## Consumer secondary navigation

The authenticated workspace groups tasks instead of exposing every page at once:

- **Overview:** Home, My pets, Care calendar
- **Pet care:** Active pet, Health, Care, Memories, Travel
- **Activity:** Bookings, Orders, Notifications
- **Account:** Subscription, notification preferences, Support

Checkout and cart are contextual actions rather than persistent primary destinations. Advanced medical pages are reached from the Health record. Detail/edit/create routes inherit their parent active state.

## Partner navigation

Provider: dashboard, bookings, calendar, patients, clinical work, hospitalizations, services, availability, team.

Seller: dashboard, catalogue/offers, orders, inventory, channels, finance/transactions/settlements, team, settings.

Both use role-specific side navigation. Consumer discovery links may appear as utilities, never mixed into operational task lists.

## Admin navigation

Admin is grouped by operating responsibility: overview, customers/households/pets, support/customer affairs, trust/disputes/audit, providers/sellers, commerce/transactions/settlements/reconciliation, subscriptions, content, and tasks. Destructive or sensitive actions stay on detail screens with audit context.

## Active-state rules

- Exact Home matching prevents every localized route from activating Home.
- Parent destinations remain active for descendants and dynamic detail routes.
- Health, Memories, Care, and Travel recognize both active-pet resolver URLs and canonical `/pets/[id]/…` URLs.
- Query-based active-pet views compare `view`; other query parameters do not change the active destination.
- Labels are Persian-first in `fa`, English in `en`; layout order follows writing direction without reversing semantic icon meaning.
