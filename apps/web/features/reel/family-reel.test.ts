import { describe, expect, it } from "vitest";
import { familyForPath, type Family } from "./family-copy";
import { buildFamilyReel } from "./family-scenes";
import { familyCopyFor, oplCopyFor } from "@/test/pattern-copy";

const FAMILIES: Family[] = ["care", "services", "shop", "travel", "safe", "together", "learn"];

describe("page family reels", () => {
  it.each([
    ["/fa/services/GROOMING", "services"], ["/en/vet/find", "services"], ["/de/providers/abc", "services"], ["/es/places", "services"],
    ["/fa/shop/products/1", "shop"], ["/en/travel/search", "travel"], ["/fa/insurance/compare", "safe"], ["/en/lost-pets", "safe"],
    ["/fa/community/posts/1", "together"], ["/de/animal-support/needs", "together"], ["/en/blog/a", "learn"], ["/es/help/faq", "learn"],
    ["/fa/home", "care"], ["/en/pets/p1/health/labs", "care"], ["/de/care-calendar", "care"], ["/es/profile/household", "care"],
    ["/fa/bookings/b1", "services"], ["/en/orders/o1", "shop"], ["/de/cart", "shop"], ["/es/donations", "together"], ["/fa/support", "learn"],
    ["/fa/checkout", null], ["/en/onboarding", null], ["/de/ngo/needs", null], ["/es/insurer", null], ["/fa/invitations/t", null],
    ["/fa/health-share/token", null], ["/en/pet-card/token", null], ["/fa", null],
  ] as const)("maps %s to its family", (path, family) => {
    expect(familyForPath(path)).toBe(family);
  });

  it.each(["fa", "en", "de", "es"] as const)("builds every %s family reel with a subtitle and chapter for each scene", (locale) => {
    for (const family of FAMILIES) {
      const reel = buildFamilyReel(family, locale, oplCopyFor(locale), familyCopyFor(locale)[family]);
      expect(reel.scenes.length).toBeGreaterThanOrEqual(5);
      expect(reel.kicks).toHaveLength(reel.scenes.length);
      expect(reel.subs).toHaveLength(reel.scenes.length);
      for (const sub of reel.subs) expect(sub.trim().length).toBeGreaterThan(0);
      for (const scene of reel.scenes) expect(scene.svg).not.toMatch(/undefined|NaN/);
      if (locale !== "fa") for (const scene of reel.scenes) expect(scene.svg, `${family} ${locale}`).not.toMatch(/[؀-ۿ]/);
    }
  });
});
