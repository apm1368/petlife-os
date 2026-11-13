import { describe, expect, it } from "vitest";
import { priceRangeSetPet, priceSetPet, type SetPetPriceTable } from "@petlife/types";
import { emptySnapshot, readSnapshot, toOrderInput } from "./builder-state";
import { parseNumber, petSizeMismatch, printDpi, sizeLabel, suggestHumanSize } from "./set-pet-catalog";

const TABLE: SetPetPriceTable = {
  garmentPricesIrr: { HUMAN_TEE: 4_000_000, HUMAN_HOODIE: 9_000_000, HUMAN_SWEATSHIRT: 7_000_000, PET_TEE: 2_500_000, PET_HOODIE: 4_000_000, PET_BANDANA: 1_500_000 },
  zonePricesIrr: { RIGHT_UPPER_ARM: 500_000, LEFT_UPPER_ARM: 500_000, FRONT_CENTER: 1_200_000, BACK: 1_200_000, PET_BACK: 800_000 },
  setDiscountPercent: 10,
};

describe("Set Pet pricing (owner F1/P35/P36/P37)", () => {
  it("adds each garment and each zone printed on it, then the set discount when people and pets are both in the set", () => {
    const price = priceSetPet(TABLE, [{ garment: "HUMAN_TEE" }, { garment: "HUMAN_HOODIE" }, { garment: "PET_BANDANA" }], ["FRONT_CENTER", "PET_BACK"]);
    expect(price.lines.map((l) => l.lineIrr)).toEqual([5_200_000, 10_200_000, 2_300_000]);
    expect(price).toMatchObject({ subtotalIrr: 17_700_000, discountPercent: 10, discountIrr: 1_770_000, totalIrr: 15_930_000, unpriced: [] });
  });

  it("gives no set discount to a human-only set, and names what the table has not priced", () => {
    expect(priceSetPet(TABLE, [{ garment: "HUMAN_TEE" }], ["BACK"]).discountIrr).toBe(0);
    expect(priceSetPet({ ...TABLE, zonePricesIrr: {} }, [{ garment: "HUMAN_TEE" }], ["BACK"]).unpriced).toEqual(["BACK"]);
  });

  it("shows a range while building: from the zones chosen (or the cheapest) up to every zone", () => {
    const range = priceRangeSetPet(TABLE, [{ garment: "HUMAN_TEE" }, { garment: "PET_TEE" }], []);
    expect(range.minIrr).toBe(Math.round((4_000_000 + 500_000 + 2_500_000 + 800_000) * 0.9));
    expect(range.maxIrr).toBe(Math.round((4_000_000 + 3_400_000 + 2_500_000 + 800_000) * 0.9));
  });
});

describe("builder state", () => {
  it("turns the builder into the API order: pets from the profile or by hand, text and design prints", () => {
    const s = {
      ...emptySnapshot(),
      items: [
        { key: "a", garment: "HUMAN_HOODIE" as const, size: "XXL" as const, colour: "black" as const },
        { key: "b", garment: "PET_TEE" as const, size: "S" as const, colour: "black" as const, petId: "pet-1", petName: "", petSpecies: "DOG" as const },
        { key: "c", garment: "PET_BANDANA" as const, size: "M" as const, colour: "sage" as const, petId: null, petName: " Lili ", petSpecies: "CAT" as const },
      ],
      prints: {
        FRONT_CENTER: { kind: "image" as const, designId: "local-1", scale: 2, offsetX: 0.5, offsetY: 0 },
        PET_BACK: { kind: "text" as const, text: " Shiraz ", font: "LALEZAR" as const, colour: "white" as const },
      },
      forPetId: "gone",
      notes: "  ",
    };
    expect(toOrderInput(s, new Map([["local-1", "server-1"]]))).toEqual({
      items: [
        { garment: "HUMAN_HOODIE", size: "XXL", colour: "black" },
        { garment: "PET_TEE", size: "S", colour: "black", petId: "pet-1" },
        { garment: "PET_BANDANA", size: "M", colour: "sage", petName: "Lili", petSpecies: "CAT" },
      ],
      placements: [
        { zone: "FRONT_CENTER", designFileId: "server-1", scale: 2, offsetX: 0.5, offsetY: 0 },
        { zone: "PET_BACK", text: "Shiraz", font: "LALEZAR", textColour: "white" },
      ],
      forPetId: null,
      notes: null,
    });
  });

  it("reads a saved draft or a reorder defensively", () => {
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot({ items: [] })).toBeNull();
    const reorder = readSnapshot({ step: "review", reorderOfId: "o1", items: [{ garment: "HUMAN_TEE", size: "HUGE", colour: "purple" }], placements: [{ zone: "BACK", designFileId: "d1", scale: 9 }, { zone: "NOSE", text: "x" }] });
    expect(reorder).toMatchObject({ step: "review", reorderOfId: "o1", items: [{ garment: "HUMAN_TEE", size: "M", colour: "white" }], prints: { BACK: { kind: "image", designId: "d1", scale: 4 } } });
    expect(Object.keys(reorder!.prints)).toEqual(["BACK"]);
  });
});

describe("Set Pet catalogue", () => {
  it("labels XXL and XXXL as 2XL and 3XL", () => {
    expect(["S", "XXL", "XXXL"].map((s) => sizeLabel(s as "S"))).toEqual(["S", "2XL", "3XL"]);
  });

  it("suggests a human size from height and weight (owner P16), never more", () => {
    expect(suggestHumanSize(175, 70)).toBe("M");
    expect(suggestHumanSize(190, 70)).toBe("L");
    expect(suggestHumanSize(null, 120)).toBe("XXXL");
    expect(suggestHumanSize(170, null)).toBeNull();
  });

  it("only warns about a pet size that doesn't fit the recorded weight (P20)", () => {
    expect(petSizeMismatch("S", 3)).toBe(false);
    expect(petSizeMismatch("S", 30)).toBe(true);
    expect(petSizeMismatch("XL", null)).toBe(false);
  });

  it("reads Persian and Arabic digits, and measures print sharpness", () => {
    expect(parseNumber("۱۷۵")).toBe(175);
    expect(parseNumber("٧٠٫٥")).toBe(70.5);
    expect(parseNumber("abc")).toBeNull();
    expect(printDpi(2362, 20)).toBe(300);
  });
});
