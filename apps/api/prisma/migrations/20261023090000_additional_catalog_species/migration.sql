-- Preserve existing dog/cat flags. Other species require explicit targeting.
ALTER TABLE "provider_services" ADD COLUMN "additionalSpecies" "PetSpecies"[] NOT NULL DEFAULT ARRAY[]::"PetSpecies"[];
ALTER TABLE "products" ADD COLUMN "additionalSpecies" "PetSpecies"[] NOT NULL DEFAULT ARRAY[]::"PetSpecies"[];
