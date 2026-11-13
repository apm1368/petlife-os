-- OpenStreetMap imports said "outdoor access allowed" for every non-park place (and "indoor" for cafés/restaurants)
-- without any source for it. Keep only what the kind of place makes plain; claimed listings are the business's own.
UPDATE "pet_friendly_places"
SET "indoorAllowed" = ("category"::text IN ('VETERINARY', 'PET_SHOP', 'GROOMING', 'BOARDING', 'SHELTER')),
    "outdoorAllowed" = ("category"::text IN ('PARK', 'DOG_PARK'))
WHERE "source" = 'OSM'
  AND "claimedByProviderOrganizationId" IS NULL
  AND NOT ('indoorAllowed' = ANY(COALESCE("osmEditedFields", ARRAY[]::text[])))
  AND NOT ('outdoorAllowed' = ANY(COALESCE("osmEditedFields", ARRAY[]::text[])));
