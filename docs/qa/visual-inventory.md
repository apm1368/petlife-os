# Visual inventory — before broad edits

Evidence: source review of every route; browser capture of fa/admin/content/new at 1265px. Data-backed views are not certified against populated reference screenshots because the API/DB is unavailable. A = verified match, B = raw, C = mismatch, D = placeholder, E = no exact reference, F = observed broken/unreachable; unavailable API data is a verification limitation, not proof of a broken route, G = absent. No page is certified A yet.

| Route | Domain | Quality | Reference | Action | Priority |
|---|---|---|---|---|---|
| /[locale]/admin/audit | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/content/[id] | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/[id]/versions | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/categories | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/media | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/new | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/placements | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/content/tags | CMS/blog | E — nearest editorial/admin reference; editor observed raw | Partial — images 2–4 | Derive editorial hierarchy; preserve existing forms and APIs | P2 |
| /[locale]/admin/customers/[id] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/customers | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/disputes/[id] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/disputes | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/providers | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/reconciliation | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/seller-finance/[id] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/seller-finance | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/sellers | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/settlements/[id] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/support/[caseId] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/support | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/tasks | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/transactions | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/trust/[id] | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/admin/trust | admin | C — navigation mismatch; live content blocked | Yes — images 4/18 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/ai | Consumer/public | D — functional placeholder | Partial — supplied boards; source-specific comparison needed | Do not invent functionality | P2 |
| /[locale]/bookings/[id] | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/bookings | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/care-calendar | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/cart | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/checkout/[id]/confirmation | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/checkout/[id]/ops | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/checkout | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/home | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/notifications | Notifications | B — shared primitives raw; data states not fully visible | Yes — images 11/12 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/notifications/preferences | Notifications | B — shared primitives raw; data states not fully visible | Yes — images 11/12 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/onboarding | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/orders/[id] | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/orders | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/care | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health/allergies | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health/conditions | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health/medications | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health/nutrition | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id]/health/vaccination | Health/care | B — shared primitives raw; data states not fully visible | Yes — images 8/22 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/[id] | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/active | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets/new | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/pets | Consumer/public | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/support/new | Support | B — shared primitives raw; data states not fully visible | Yes — image 17 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/support | Support | B — shared primitives raw; data states not fully visible | Yes — image 17 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/support/tickets/[id] | Support | B — shared primitives raw; data states not fully visible | Yes — image 17 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/support/tickets | Support | B — shared primitives raw; data states not fully visible | Yes — image 17 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/account/forgot | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/account | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/account/reset | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/auth/complete | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/register | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/welcome | Auth | B — shared primitives raw; data states not fully visible | Yes — image 16 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/provider/availability | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider/bookings/[id] | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider/bookings | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider/calendar | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider/services | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/provider/team | provider | C — navigation mismatch; live content blocked | Yes — images 5/19 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/blog/[slug] | CMS/blog | B — editorial reference exists; full rendered parity pending | Yes — images 2–3 | Match editorial hierarchy, article imagery and responsive reading layout | P2 |
| /[locale]/blog/category/[slug] | CMS/blog | B — editorial reference exists; full rendered parity pending | Yes — images 2–3 | Match editorial hierarchy, article imagery and responsive reading layout | P2 |
| /[locale]/blog | CMS/blog | B — editorial reference exists; full rendered parity pending | Yes — images 2–3 | Match editorial hierarchy, article imagery and responsive reading layout | P2 |
| /[locale]/blog/tag/[slug] | CMS/blog | B — editorial reference exists; full rendered parity pending | Yes — images 2–3 | Match editorial hierarchy, article imagery and responsive reading layout | P2 |
| /[locale]/services/[category]/[serviceId]/book | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/services/[category] | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/services | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/shop | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/shop/products/[id] | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/shop/products | Commerce | B — shared primitives raw; data states not fully visible | Yes — images 10/25 | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/vet/[providerId]/book | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/vet/[providerId] | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/vet/find | Discovery/booking | B — shared primitives raw; data states not fully visible | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P2 |
| /[locale]/seller/channels | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/finance | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/finance/settlements/[id] | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/finance/settlements | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/finance/transactions | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/inventory | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/offers | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/orders/[id] | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/orders | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/settings | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale]/seller/team | seller | C — navigation mismatch; live content blocked | Yes — images 6/20 | Compact sidebar, mobile disclosure, existing routes; restore data separately | P1 |
| /[locale] | Consumer/public | C — spatial landing has separate approved brief; verify overlays | Partial — supplied boards; source-specific comparison needed | Align tokens, focus/touch states, page motion, spacing; compare in domain batch | P1 |

## G — not implemented (no replacement routes)
Standalone profile/settings, medical documents/labs/imaging/referrals/observations, subscription plans/usage/billing, lost-pet/community/travel/insurance, organization clinical workspace: no corresponding implemented route in this tree. Keep these with feature owner; do not create backend or fake route shells.

## Batch order and files
1. Shared motion + reference palette/primitives + navigation: apps/web/features/motion, features/navigation, local-preview; packages/ui/src; packages/design-tokens/css. 2. Landing/auth. 3. Home/pets/health. 4. Discovery/commerce/support/notifications. 5. Role workspaces/CMS. Data-backed visual fidelity is blocked until real data can load.

## Assets
Reuse supplied Cookie images. No new decorative images needed for shared motion/navigation. Domain-specific new illustrations require a measured slot and separate visual batch; do not place arbitrary stock imagery.

## Follow-up — 2026-09-04
Route count rechecked: 94. No route has full visual acceptance yet. Shared motion/tokens and operational local-preview sidebar are now implemented; live workspace shells still need their own alignment. Blog and article have explicit editorial references (images 2–3); E applies only to CMS-specific controls without exact reference. Remaining work follows the requested order: Landing/Auth, Home, Health, Vet, Services, Commerce, Support, Notifications, Subscription, Provider, Seller, Admin, secondary routes. Auth routes intentionally redirect in local review; production auth visual verification requires a separate non-preview run and is not marked broken.
