import { PetSpecies } from "@prisma/client";
import { speciesFilter, supportedSpecies } from "./catalog-species";

describe("catalog species targeting", () => {
  it("preserves legacy dog/cat flags and never implies support for other species", () => {
    expect(supportedSpecies({ supportsDog: true, supportsCat: false })).toEqual(["DOG"]);
    expect(supportedSpecies({ supportsDog: false, supportsCat: false, additionalSpecies: [PetSpecies.DOG, PetSpecies.BIRD] })).toEqual(["BIRD"]);
  });
  it.each(Object.values(PetSpecies))("filters %s explicitly", (species) => {
    expect(speciesFilter(species)).toEqual(species === "DOG" ? { supportsDog: true } : species === "CAT" ? { supportsCat: true } : { additionalSpecies: { has: species } });
  });
  it("returns each supported species once in canonical order", () => {
    expect(supportedSpecies({ supportsDog: true, supportsCat: true, additionalSpecies: Object.values(PetSpecies) })).toEqual(Object.values(PetSpecies));
  });
});
