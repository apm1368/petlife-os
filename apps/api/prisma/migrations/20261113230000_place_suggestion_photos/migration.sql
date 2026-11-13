-- Owner #6 (2026-11-13): up to three private member photos per place suggestion (object keys under
-- place-suggestions/<userId>/); approval copies them into the new place's public gallery.
ALTER TABLE "place_suggestions" ADD COLUMN "photoObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
