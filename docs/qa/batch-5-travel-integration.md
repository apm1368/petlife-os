# Batch 5 — Travel Marketplace integration audit

## Existing domain retained

- `TravelListing`, `TravelPetPolicy`, `TravelInventoryUnit`, `TravelAvailability`, `TravelBooking`, and `TravelBookedNight` already cover provider supply, date-level availability, price overrides, booking price snapshots, and database-enforced inventory slots.
- `Trip` stays the canonical travel-plan record. `Insurance*` and `PetFriendlyPlace*` remain separate existing bounded domains.
- No Travel Marketplace schema migration was introduced in this integration pass.

## Registered contracts

- Public discovery: `/travel/listings`, `/travel/listings/cities`, public listing detail, unit availability, and server-calculated quote.
- Pet-scoped traveller bookings: `/pets/:petId/travel-bookings/*`.
- Provider operations: `/provider/travel/*` using the existing active-provider context and OWNER role for supply mutations.
- Admin moderation: `/admin/travel/*`, guarded by the new `travel.view` and `travel.manage` permissions. Publish, suspension, archive, and verification changes write an audit row in the same transaction.

## Security decisions

- Availability and quote endpoints first establish that the requested listing is public and that the unit belongs to it. Guessed unit IDs cannot expose unpublished supply.
- A traveller endpoint is scoped to its route pet. A temporary caregiver cannot use it to read other pets' household bookings.
- The current single-pet booking route intentionally ignores client-provided extra `petIds`; multi-pet booking needs an explicit per-pet-grant authorization step before it can be exposed.

## Confirmed product gap

`TravelListing` has a status lifecycle but no persistent provider-visible moderation note. Admin reasons are safely recorded in `AdminAuditLog`, but a future provider-facing “needs correction” message requires a narrowly scoped schema addition. It was not improvised in this pass.

## Verification

- `pnpm --filter @petlife/types build` passed.
- `pnpm --filter @petlife/api typecheck` passed.
- `pnpm --filter @petlife/web typecheck` passed.
- Targeted API lint passed.
- Travel/insurance/places E2E could not start locally because PostgreSQL was unavailable at `localhost:5432`; the failure happened in existing Ledger startup before any test request.
