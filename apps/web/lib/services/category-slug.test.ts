import { describe, expect, it } from "vitest";
import { serviceCategoryFromSlug, serviceCategoryPath, serviceCategorySlug } from "./category-slug";

describe("service category slugs", () => {
  it("uses lowercase, hyphenated slugs in URLs", () => {
    expect(serviceCategorySlug("PET_TAXI")).toBe("pet-taxi");
    expect(serviceCategoryPath("fa", "GROOMING")).toBe("/fa/services/grooming");
  });
  it("reads any spelling back to the API code, and nothing else", () => {
    for (const s of ["grooming", "GROOMING", "Grooming"]) expect(serviceCategoryFromSlug(s)).toBe("GROOMING");
    for (const s of ["pet-taxi", "PET_TAXI", "pet_taxi"]) expect(serviceCategoryFromSlug(s)).toBe("PET_TAXI");
    for (const s of ["search", "vets", "", "groom%"]) expect(serviceCategoryFromSlug(s)).toBeNull();
  });
});
