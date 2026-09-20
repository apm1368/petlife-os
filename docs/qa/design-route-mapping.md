# Design → route implementation matrix

Source: Desktop/UI. Landing and all portal overview dashboards are excluded.

154 routes; 149 in scope. 33 files, 17 unique image hashes. A board may contain several design families.

UNREVIEWED is deliberately not an acceptance grade. A–G classification requires actual inspection; HTTP 200 is not acceptance.

## References

1. ChatGPT Image Sep 2, 2026, 04_44_13 PM (1).png (3 copies)
2. ChatGPT Image Sep 2, 2026, 04_44_39 PM (2) (1).png (3 copies)
3. ChatGPT Image Sep 2, 2026, 04_44_57 PM.png (2 copies)
4. ChatGPT Image Sep 2, 2026, 04_45_40 PM.png (4 copies)
5. ChatGPT Image Sep 2, 2026, 04_46_16 PM.png (2 copies)
6. ChatGPT Image Sep 2, 2026, 04_46_40 PM.png (3 copies)
7. ChatGPT Image Sep 2, 2026, 04_46_59 PM.png (2 copies)
8. ChatGPT Image Sep 2, 2026, 04_47_31 PM.png (2 copies)
9. ChatGPT Image Sep 2, 2026, 04_48_01 PM.png (2 copies)
10. ChatGPT Image Sep 2, 2026, 04_48_08 PM.png (2 copies)
11. ChatGPT Image Sep 2, 2026, 04_48_19 PM.png (2 copies)
12. ChatGPT Image Sep 2, 2026, 04_48_44 PM.png (1 copies)
13. ChatGPT Image Sep 2, 2026, 04_48_54 PM.png (1 copies)
14. ChatGPT Image Sep 2, 2026, 04_49_03 PM.png (1 copies)
15. ChatGPT Image Sep 2, 2026, 04_51_47 PM (1).png (1 copies)
16. ChatGPT Image Sep 2, 2026, 04_51_47 PM (2).png (1 copies)
17. ChatGPT Image Sep 2, 2026, 04_52_32 PM.png (1 copies)

## Routes

| Route | Domain | Auth | Status | Next action |
|---|---|---|---|---|
| /[locale]/admin/audit | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/categories | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/media | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/new | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/placements | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/tags | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/content/[id]/versions | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/crm | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/customer-affairs | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/customers | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/customers/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/disputes | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/disputes/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin | admin | session; role/pet permissions per API | EXCLUDED | Preserve appearance |
| /[locale]/admin/providers | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/reconciliation | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/seller-finance | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/seller-finance/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/sellers | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/settlements/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/subscriptions/households | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/subscriptions/households/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/subscriptions | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/support | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/support/[caseId] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/tasks | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/transactions | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/trust | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/admin/trust/[id] | admin | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/ai | ai | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/bookings | bookings | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/bookings/[id] | bookings | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/care-calendar | care-calendar | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/cart | cart | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/checkout | checkout | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/checkout/[id]/confirmation | checkout | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/checkout/[id]/ops | checkout | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/donations | donations | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/home | home | session; role/pet permissions per API | EXCLUDED | Preserve appearance |
| /[locale]/notifications | notifications | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/notifications/preferences | notifications | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/onboarding | onboarding | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/orders | orders | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/orders/[id] | orders | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/active | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/new | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/care | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/dental | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/discharge | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/documents | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/estimates | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/imaging | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/labs | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/nutrition | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/observations | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/referrals | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/rehab | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/timeline | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/advanced/vitals | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/allergies | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/conditions | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/medications | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/nutrition | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/health/vaccination | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/insurance | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/life-timeline | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/lost | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/lost/report | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/lost/[incidentId] | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/memories/new | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/memories | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/memories/[memoryId]/edit | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/memories/[memoryId] | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id] | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/travel/new | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/travel | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/travel/passport | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/pets/[id]/travel/[tripId] | pets | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/places/favorites | places | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/profile | profile | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/subscription | subscription | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/subscription/plans | subscription | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/support/new | support | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/support | support | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/support/tickets | support | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/support/tickets/[id] | support | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/account/forgot | account | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/account | account | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/account/reset | account | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/auth/complete | auth | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/auth | auth | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/register | register | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/welcome | welcome | public auth flow | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/availability | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/bookings | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/bookings/[id] | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/calendar | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/clinical | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/hospitalizations/[hospitalizationId] | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider | provider | session; role/pet permissions per API | EXCLUDED | Preserve appearance |
| /[locale]/provider/patients | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/patients/[petId] | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/services | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/team | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/provider/visits/[id] | provider | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/campaigns | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/campaigns/[campaignId] | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/needs/mine | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/needs/new | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/needs | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/needs/[listingId] | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support/organizations/[organizationId] | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/animal-support | animal-support | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/blog/category/[slug] | blog | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/blog | blog | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/blog/tag/[slug] | blog | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/blog/[slug] | blog | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/community/new | community | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/community | community | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/community/posts/[postId] | community | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/insurance/compare | insurance | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/insurance | insurance | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/insurance/[productId] | insurance | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/lost-pets | lost-pets | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/lost-pets/[incidentId] | lost-pets | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/places | places | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/places/[placeId] | places | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/services | services | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/services/[category] | services | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/services/[category]/[serviceId]/book | services | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/shop | shop | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/shop/products | shop | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/shop/products/[id] | shop | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/vet/find | vet | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/vet/[providerId]/book | vet | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/vet/[providerId] | vet | public | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/channels | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/finance | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/finance/settlements | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/finance/settlements/[id] | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/finance/transactions | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/inventory | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/offers | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/orders | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/orders/[id] | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller | seller | session; role/pet permissions per API | EXCLUDED | Preserve appearance |
| /[locale]/seller/settings | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale]/seller/team | seller | session; role/pet permissions per API | UNREVIEWED | Compare reference, exercise actions and states |
| /[locale] | landing | public | EXCLUDED | Preserve appearance |
