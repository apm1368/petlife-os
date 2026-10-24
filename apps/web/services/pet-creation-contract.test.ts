import { describe, expect, it } from "vitest";
import { PetSpecies } from "@petlife/types";
import { createPetSchema } from "../../../packages/validation/src";

describe("shared pet creation contract", () => {
  const identity = { name: "Unknown age", species: PetSpecies.CAT };
  it("accepts unknown age without relaxing validation of supplied age values", () => {
    expect(createPetSchema.safeParse(identity).success).toBe(true);
    expect(createPetSchema.safeParse({ ...identity, approximateAgeMonths: 0 }).success).toBe(true);
    for (const approximateAgeMonths of [-1, 601, 1.5]) {
      expect(createPetSchema.safeParse({ ...identity, approximateAgeMonths }).success).toBe(false);
    }
    expect(createPetSchema.safeParse({ ...identity, birthDate: "not-a-date" }).success).toBe(false);
    expect(createPetSchema.safeParse({ ...identity, name: "" }).success).toBe(false);
  });
});
