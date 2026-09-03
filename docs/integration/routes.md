# Integrated route inventory

Generated from apps/web/app page.tsx files on integration/local. [locale] is fa or en. Dynamic IDs must come from API data.

| Route | Access boundary | Source |
|---|---|---|
| `/[locale]/admin/audit` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/audit/page.tsx` |
| `/[locale]/admin/customers/[id]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/customers/[id]/page.tsx` |
| `/[locale]/admin/customers` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/customers/page.tsx` |
| `/[locale]/admin/disputes/[id]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/disputes/[id]/page.tsx` |
| `/[locale]/admin/disputes` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/disputes/page.tsx` |
| `/[locale]/admin` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/page.tsx` |
| `/[locale]/admin/providers` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/providers/page.tsx` |
| `/[locale]/admin/reconciliation` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/reconciliation/page.tsx` |
| `/[locale]/admin/seller-finance/[id]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/seller-finance/[id]/page.tsx` |
| `/[locale]/admin/seller-finance` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/seller-finance/page.tsx` |
| `/[locale]/admin/sellers` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/sellers/page.tsx` |
| `/[locale]/admin/settlements/[id]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/settlements/[id]/page.tsx` |
| `/[locale]/admin/support/[caseId]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/support/[caseId]/page.tsx` |
| `/[locale]/admin/support` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/support/page.tsx` |
| `/[locale]/admin/tasks` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/tasks/page.tsx` |
| `/[locale]/admin/transactions` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/transactions/page.tsx` |
| `/[locale]/admin/trust/[id]` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/trust/[id]/page.tsx` |
| `/[locale]/admin/trust` | Admin role/permission | `apps/web/app/[locale]/(admin)/admin/trust/page.tsx` |
| `/[locale]/ai` | Authenticated app | `apps/web/app/[locale]/(app)/ai/page.tsx` |
| `/[locale]/bookings/[id]` | Authenticated app | `apps/web/app/[locale]/(app)/bookings/[id]/page.tsx` |
| `/[locale]/bookings` | Authenticated app | `apps/web/app/[locale]/(app)/bookings/page.tsx` |
| `/[locale]/care-calendar` | Authenticated app | `apps/web/app/[locale]/(app)/care-calendar/page.tsx` |
| `/[locale]/cart` | Authenticated app | `apps/web/app/[locale]/(app)/cart/page.tsx` |
| `/[locale]/checkout/[id]/confirmation` | Authenticated app | `apps/web/app/[locale]/(app)/checkout/[id]/confirmation/page.tsx` |
| `/[locale]/checkout/[id]/ops` | Authenticated app | `apps/web/app/[locale]/(app)/checkout/[id]/ops/page.tsx` |
| `/[locale]/checkout` | Authenticated app | `apps/web/app/[locale]/(app)/checkout/page.tsx` |
| `/[locale]/home` | Authenticated app | `apps/web/app/[locale]/(app)/home/page.tsx` |
| `/[locale]/notifications` | Authenticated app | `apps/web/app/[locale]/(app)/notifications/page.tsx` |
| `/[locale]/notifications/preferences` | Authenticated app | `apps/web/app/[locale]/(app)/notifications/preferences/page.tsx` |
| `/[locale]/onboarding` | Authenticated app | `apps/web/app/[locale]/(app)/onboarding/page.tsx` |
| `/[locale]/orders/[id]` | Authenticated app | `apps/web/app/[locale]/(app)/orders/[id]/page.tsx` |
| `/[locale]/orders` | Authenticated app | `apps/web/app/[locale]/(app)/orders/page.tsx` |
| `/[locale]/pets/[id]/care` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/care/page.tsx` |
| `/[locale]/pets/[id]/health/allergies` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/allergies/page.tsx` |
| `/[locale]/pets/[id]/health/conditions` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/conditions/page.tsx` |
| `/[locale]/pets/[id]/health/medications` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/medications/page.tsx` |
| `/[locale]/pets/[id]/health/nutrition` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/nutrition/page.tsx` |
| `/[locale]/pets/[id]/health` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/page.tsx` |
| `/[locale]/pets/[id]/health/vaccination` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/health/vaccination/page.tsx` |
| `/[locale]/pets/[id]` | Authenticated app | `apps/web/app/[locale]/(app)/pets/[id]/page.tsx` |
| `/[locale]/pets/active` | Authenticated app | `apps/web/app/[locale]/(app)/pets/active/page.tsx` |
| `/[locale]/pets/new` | Authenticated app | `apps/web/app/[locale]/(app)/pets/new/page.tsx` |
| `/[locale]/pets` | Authenticated app | `apps/web/app/[locale]/(app)/pets/page.tsx` |
| `/[locale]/support/new` | Authenticated app | `apps/web/app/[locale]/(app)/support/new/page.tsx` |
| `/[locale]/support` | Authenticated app | `apps/web/app/[locale]/(app)/support/page.tsx` |
| `/[locale]/support/tickets/[id]` | Authenticated app | `apps/web/app/[locale]/(app)/support/tickets/[id]/page.tsx` |
| `/[locale]/support/tickets` | Authenticated app | `apps/web/app/[locale]/(app)/support/tickets/page.tsx` |
| `/[locale]/account/forgot` | Authentication | `apps/web/app/[locale]/(auth)/account/forgot/page.tsx` |
| `/[locale]/account` | Authentication | `apps/web/app/[locale]/(auth)/account/page.tsx` |
| `/[locale]/account/reset` | Authentication | `apps/web/app/[locale]/(auth)/account/reset/page.tsx` |
| `/[locale]/auth/complete` | Authentication | `apps/web/app/[locale]/(auth)/auth/complete/page.tsx` |
| `/[locale]/register` | Authentication | `apps/web/app/[locale]/(auth)/register/page.tsx` |
| `/[locale]/welcome` | Authentication | `apps/web/app/[locale]/(auth)/welcome/page.tsx` |
| `/[locale]/provider/availability` | Provider role | `apps/web/app/[locale]/(provider)/provider/availability/page.tsx` |
| `/[locale]/provider/bookings/[id]` | Provider role | `apps/web/app/[locale]/(provider)/provider/bookings/[id]/page.tsx` |
| `/[locale]/provider/bookings` | Provider role | `apps/web/app/[locale]/(provider)/provider/bookings/page.tsx` |
| `/[locale]/provider/calendar` | Provider role | `apps/web/app/[locale]/(provider)/provider/calendar/page.tsx` |
| `/[locale]/provider` | Provider role | `apps/web/app/[locale]/(provider)/provider/page.tsx` |
| `/[locale]/provider/services` | Provider role | `apps/web/app/[locale]/(provider)/provider/services/page.tsx` |
| `/[locale]/provider/team` | Provider role | `apps/web/app/[locale]/(provider)/provider/team/page.tsx` |
| `/[locale]/services/[category]/[serviceId]/book` | Public shell; auth required for booking | `apps/web/app/[locale]/(public)/services/[category]/[serviceId]/book/page.tsx` |
| `/[locale]/services/[category]` | Public discovery | `apps/web/app/[locale]/(public)/services/[category]/page.tsx` |
| `/[locale]/services` | Public discovery | `apps/web/app/[locale]/(public)/services/page.tsx` |
| `/[locale]/shop` | Public discovery | `apps/web/app/[locale]/(public)/shop/page.tsx` |
| `/[locale]/shop/products/[id]` | Public discovery | `apps/web/app/[locale]/(public)/shop/products/[id]/page.tsx` |
| `/[locale]/shop/products` | Public discovery | `apps/web/app/[locale]/(public)/shop/products/page.tsx` |
| `/[locale]/vet/[providerId]/book` | Public shell; auth required for booking | `apps/web/app/[locale]/(public)/vet/[providerId]/book/page.tsx` |
| `/[locale]/vet/[providerId]` | Public discovery | `apps/web/app/[locale]/(public)/vet/[providerId]/page.tsx` |
| `/[locale]/vet/find` | Public discovery | `apps/web/app/[locale]/(public)/vet/find/page.tsx` |
| `/[locale]/seller/channels` | Seller role | `apps/web/app/[locale]/(seller)/seller/channels/page.tsx` |
| `/[locale]/seller/finance` | Seller role | `apps/web/app/[locale]/(seller)/seller/finance/page.tsx` |
| `/[locale]/seller/finance/settlements/[id]` | Seller role | `apps/web/app/[locale]/(seller)/seller/finance/settlements/[id]/page.tsx` |
| `/[locale]/seller/finance/settlements` | Seller role | `apps/web/app/[locale]/(seller)/seller/finance/settlements/page.tsx` |
| `/[locale]/seller/finance/transactions` | Seller role | `apps/web/app/[locale]/(seller)/seller/finance/transactions/page.tsx` |
| `/[locale]/seller/inventory` | Seller role | `apps/web/app/[locale]/(seller)/seller/inventory/page.tsx` |
| `/[locale]/seller/offers` | Seller role | `apps/web/app/[locale]/(seller)/seller/offers/page.tsx` |
| `/[locale]/seller/orders/[id]` | Seller role | `apps/web/app/[locale]/(seller)/seller/orders/[id]/page.tsx` |
| `/[locale]/seller/orders` | Seller role | `apps/web/app/[locale]/(seller)/seller/orders/page.tsx` |
| `/[locale]/seller` | Seller role | `apps/web/app/[locale]/(seller)/seller/page.tsx` |
| `/[locale]/seller/settings` | Seller role | `apps/web/app/[locale]/(seller)/seller/settings/page.tsx` |
| `/[locale]/seller/team` | Seller role | `apps/web/app/[locale]/(seller)/seller/team/page.tsx` |
| `/[locale]` | Public landing | `apps/web/app/[locale]/page.tsx` |

`/` is handled by locale middleware. No standalone `/auth`, `/login`, `/explore`, `/health`, or `/vet` page exists. Login is `/[locale]/welcome` then `/[locale]/account`; health is `/[locale]/pets/[id]/health`; vet discovery is `/[locale]/vet/find`. `/[locale]/auth/complete` is the OAuth completion route. Booking routes in the public group use RequireAuth. Route existence is not proof of a working API or authorized role.
