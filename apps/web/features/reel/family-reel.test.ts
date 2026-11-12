import { describe, expect, it } from "vitest";
import { familyCopy, familyForPath, type Family } from "./family-copy";
import { buildFamilyReel } from "./family-scenes";

const FAMILIES: Family[] = ["services", "shop", "travel", "safe", "together", "learn"];
const keys = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) =>
  typeof child === "object" && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]).sort();

describe("public page reels", () => {
  it.each([
    ["/fa/services/GROOMING", "services"], ["/en/vet/find", "services"], ["/de/providers/abc", "services"], ["/es/places", "services"],
    ["/fa/shop/products/1", "shop"], ["/en/travel/search", "travel"], ["/fa/insurance/compare", "safe"], ["/en/lost-pets", "safe"],
    ["/fa/community/posts/1", "together"], ["/de/animal-support/needs", "together"], ["/en/blog/a", "learn"], ["/es/help/faq", "learn"],
    ["/fa/health-share/token", null], ["/en/pet-card/token", null], ["/fa", null],
  ] as const)("maps %s to its family", (path, family) => {
    expect(familyForPath(path)).toBe(family);
  });

  it("keeps the section reel copy aligned in all four languages", () => {
    for (const locale of ["en", "de", "es"] as const) expect(keys(familyCopy[locale])).toEqual(keys(familyCopy.fa));
  });

  it.each(["fa", "en", "de", "es"] as const)("builds every %s family reel with a subtitle and chapter for each scene", (locale) => {
    for (const family of FAMILIES) {
      const reel = buildFamilyReel(family, locale);
      expect(reel.scenes.length).toBeGreaterThanOrEqual(5);
      expect(reel.kicks).toHaveLength(reel.scenes.length);
      expect(reel.subs).toHaveLength(reel.scenes.length);
      for (const sub of reel.subs) expect(sub.trim().length).toBeGreaterThan(0);
      for (const scene of reel.scenes) expect(scene.svg).not.toMatch(/undefined|NaN/);
      if (locale !== "fa") for (const scene of reel.scenes) expect(scene.svg, `${family} ${locale}`).not.toMatch(/[؀-ۿ]/);
    }
  });
});
