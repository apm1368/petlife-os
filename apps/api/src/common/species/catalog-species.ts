import { PetSpecies } from "@prisma/client";

type SpeciesTarget = { supportsDog: boolean; supportsCat: boolean; additionalSpecies?: PetSpecies[] };

/** Legacy flags remain authoritative for dog/cat; other species are always opt-in. */
export function supportedSpecies(target: SpeciesTarget): PetSpecies[] {
  return Object.values(PetSpecies).filter((species) =>
    species === "DOG" ? target.supportsDog : species === "CAT" ? target.supportsCat : target.additionalSpecies?.includes(species),
  );
}

export function speciesFilter(species?: PetSpecies) {
  if (!species) return {};
  if (species === "DOG") return { supportsDog: true };
  if (species === "CAT") return { supportsCat: true };
  return { additionalSpecies: { has: species } };
}
