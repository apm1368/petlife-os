import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, normalizeSlugInput, slugify } from "./slug";

describe("article URL slugs", () => {
  it("builds clean slugs from English, German and Spanish titles", () => {
    expect(slugify("Puppy Potty Training: Step by Step!")).toBe("puppy-potty-training-step-by-step");
    expect(slugify("Welpen stubenrein machen – für Anfänger")).toBe("welpen-stubenrein-machen-fuer-anfaenger");
    expect(slugify("¿Por qué muerden los gatos? Niño y señal")).toBe("por-que-muerden-los-gatos-nino-y-senal");
  });

  it("transliterates Persian titles into a valid, editable Latin slug", () => {
    const slug = slugify("آموزش دستشویی سگ در ۲ هفته");
    // Persian omits short vowels, so this is a readable starting point the editor can refine.
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug.split("-")).toEqual(["amozsh", "dstshoii", "sg", "dr", "2", "hfte"]);
  });

  it("never produces leading, trailing or doubled hyphens and stays short", () => {
    expect(slugify("  --Hello   world--  ")).toBe("hello-world");
    expect(slugify("a ".repeat(200)).length).toBeLessThanOrEqual(80);
    expect(slugify("a ".repeat(200))).toMatch(SLUG_PATTERN);
  });

  it("keeps only allowed characters while typing", () => {
    expect(normalizeSlugInput("Cat Litter_Training")).toBe("cat-litter-training");
    expect(normalizeSlugInput("سگ-dog")).toBe("-dog");
  });
});
