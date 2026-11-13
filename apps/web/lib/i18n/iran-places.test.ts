import { describe, expect, it } from "vitest";
import { persianSourceProps, placeName, placeQuery } from "./iran-places";

describe("placeName", () => {
  it("keeps Persian on fa and localizes known provinces and cities elsewhere", () => {
    expect(placeName("تهران", "fa")).toBe("تهران");
    expect(placeName("تهران", "en")).toBe("Tehran");
    expect(placeName("تهران", "de")).toBe("Teheran");
    expect(placeName("تهران", "es")).toBe("Teherán");
    expect(placeName("آذربایجان شرقی", "nl")).toBe("Oost-Azerbeidzjan");
    expect(placeName("مشهد", "ar")).toBe("مشهد");
    expect(placeName("خراسان رضوی", "ar")).toBe("خراسان رضوي");
  });
  it("matches common spelling variants and passes unknown names through", () => {
    expect(placeName("  كرمانشاه ", "en")).toBe("Kermanshah");
    expect(placeName("خرم آباد", "en")).toBe("Khorramabad");
    expect(placeName("لواسان", "en")).toBe("لواسان");
    expect(placeName(null, "en")).toBe("");
  });
});

describe("persianSourceProps", () => {
  it("marks Persian partner text outside fa only", () => {
    expect(persianSourceProps("پوشش هزینهٔ درمان", "en")).toEqual({ lang: "fa", dir: "rtl" });
    expect(persianSourceProps("پوشش هزینهٔ درمان", "fa")).toEqual({});
    expect(persianSourceProps("Treatment cover", "en")).toEqual({});
  });
});

describe("placeQuery", () => {
  it("turns a name typed in any UI language into the stored Persian value", () => {
    expect(placeQuery("Tehran")).toBe("تهران");
    expect(placeQuery(" teherán ")).toBe("تهران");
    expect(placeQuery("Oost-Azerbeidzjan")).toBe("آذربایجان شرقی");
    expect(placeQuery("تهران")).toBe("تهران");
    expect(placeQuery("Lavasan")).toBe("Lavasan");
  });
});
