# PET LIFE OS route inventory — H01–H15

Generated from the actual integrated App Router tree on 2026-09-03. Both fa and en are supported. Local preview is opt-in and loopback-only; it opens UI without granting API permissions. Dynamic IDs/slugs must come from live lists, never fabricated.

| Route | Audience | Live auth | Entry point | Parent navigation | Verification |
|---|---|---|---|---|---|
| /[locale]/admin/audit | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/[id]/versions | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/categories | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/media | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/new | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/placements | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/content/tags | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | Admin CMS navigation | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/customers/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/customers | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/disputes/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/disputes | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/providers | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/reconciliation | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/seller-finance/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/seller-finance | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/sellers | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/settlements/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/support/[caseId] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/support | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/tasks | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/transactions | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/trust/[id] | ADMIN | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/admin/trust | ADMIN | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | ADMIN shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/ai | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/bookings/[id] | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/bookings | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/care-calendar | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/cart | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/checkout/[id]/confirmation | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/checkout/[id]/ops | INTERNAL | Callback/session dependent | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/checkout | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/home | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/notifications | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/notifications/preferences | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/onboarding | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/orders/[id] | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/orders | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/care | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health/allergies | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health/conditions | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health/medications | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health/nutrition | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id]/health/vaccination | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/[id] | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/active | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets/new | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/pets | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/support/new | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/support | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/support/tickets/[id] | CONSUMER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/support/tickets | CONSUMER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | App navigation / parent flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/account/forgot | AUTH | No | Welcome choices; local preview redirects to requested page | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/account | AUTH | No | Welcome choices; local preview redirects to requested page | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/account/reset | AUTH | No | Welcome choices; local preview redirects to requested page | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/auth/complete | INTERNAL | Callback/session dependent | Workflow only; not global navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/register | AUTH | No | Welcome choices; local preview redirects to requested page | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/welcome | AUTH | No | Welcome choices; local preview redirects to requested page | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/availability | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/bookings/[id] | PROVIDER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/bookings | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/calendar | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/services | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/provider/team | PROVIDER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | PROVIDER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/blog/[slug] | PUBLIC | No | Parent list/detail; requires real ID or slug | Public navigation / blog index | Source checked; runtime details in h15-local-review.md |
| /[locale]/blog/category/[slug] | PUBLIC | No | Parent list/detail; requires real ID or slug | Public navigation / blog index | Source checked; runtime details in h15-local-review.md |
| /[locale]/blog | PUBLIC | No | Local Pages menu; product/portal navigation | Public navigation / blog index | Source checked; runtime details in h15-local-review.md |
| /[locale]/blog/tag/[slug] | PUBLIC | No | Parent list/detail; requires real ID or slug | Public navigation / blog index | Source checked; runtime details in h15-local-review.md |
| /[locale]/services/[category]/[serviceId]/book | PUBLIC | Session (auth-on-action) | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/services/[category] | PUBLIC | No | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/services | PUBLIC | No | Local Pages menu; product/portal navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/shop | PUBLIC | No | Local Pages menu; product/portal navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/shop/products/[id] | PUBLIC | No | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/shop/products | PUBLIC | No | Local Pages menu; product/portal navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/vet/[providerId]/book | PUBLIC | Session (auth-on-action) | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/vet/[providerId] | PUBLIC | No | Parent list/detail; requires real ID or slug | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/vet/find | PUBLIC | No | Local Pages menu; product/portal navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/channels | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/finance | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/finance/settlements/[id] | SELLER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/finance/settlements | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/finance/transactions | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/inventory | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/offers | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/orders/[id] | SELLER | Session; API enforces role or resource access | Parent list/detail; requires real ID or slug | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/orders | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/settings | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale]/seller/team | SELLER | Session; API enforces role or resource access | Local Pages menu; product/portal navigation | SELLER shell | Source checked; runtime details in h15-local-review.md |
| /[locale] | PUBLIC | No | Local Pages menu; product/portal navigation | Landing / public header / auth flow | Source checked; runtime details in h15-local-review.md |
