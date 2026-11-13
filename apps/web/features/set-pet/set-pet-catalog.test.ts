import { describe, expect, it } from "vitest";
import { HUMAN_FRAME, boxStyle, humanFrame, humanZoneBox, petFrame, petShirtShape } from "./garment-geometry";
import { HUMAN_CHART, SIZES, checkMeasurement, isRasterPreviewable, parseMeasurement, roundMeasurement, sizeLabel, suggestPetSize, zoneSide } from "./set-pet-catalog";
import { setPetReel } from "./set-pet-reel";

describe("Set Pet catalogue (owner, 2026-11-13)", () => {
  it("shows XXL and XXXL as 2XL and 3XL", () => {
    expect(SIZES.map(sizeLabel)).toEqual(["S", "M", "L", "XL", "2XL", "3XL"]);
  });

  it("suggests the pet size from the chest girth", () => {
    expect(suggestPetSize(45)).toBe("M");
    expect(suggestPetSize(48)).toBe("L");
    expect(suggestPetSize(20)).toBe("S");
    expect(suggestPetSize(120)).toBe("XXXL");
    expect(suggestPetSize(null)).toBeNull();
  });

  it("reads Persian and Arabic digits and either decimal mark", () => {
    expect(parseMeasurement("۳۲٫۵")).toBe(32.5);
    expect(parseMeasurement("٤٥")).toBe(45);
    expect(parseMeasurement("12,4")).toBe(12.4);
    expect(parseMeasurement("")).toBeNull();
    expect(parseMeasurement("abc")).toBeNull();
  });

  it("refuses implausible measurements, like the API", () => {
    expect(checkMeasurement("neckCm", 30)).toBe("ok");
    expect(checkMeasurement("neckCm", 300)).toBe("range");
    expect(checkMeasurement("weightKg", null)).toBe("empty");
    expect(roundMeasurement("chestCm", 45.27)).toBe(45.3);
    expect(roundMeasurement("weightKg", 12.345)).toBe(12.35);
  });

  it("previews only raster images; SVG and print files never", () => {
    expect(isRasterPreviewable({ name: "cat.png", type: "image/png" })).toBe(true);
    expect(isRasterPreviewable({ name: "cat.JPG", type: "image/jpeg" })).toBe(true);
    expect(isRasterPreviewable({ name: "art.svg", type: "image/svg+xml" })).toBe(false);
    expect(isRasterPreviewable({ name: "art.png", type: "image/svg+xml" })).toBe(false);
    expect(isRasterPreviewable({ name: "art.svg", type: "image/png" })).toBe(false);
    expect(isRasterPreviewable({ name: "print.pdf", type: "application/pdf" })).toBe(false);
    expect(isRasterPreviewable({ name: "photo.heic", type: "image/heic" })).toBe(false);
  });
});

describe("garment mockups at true scale", () => {
  it("keeps the print areas in cm on every size (10×10 sleeves, 20×20 front and back)", () => {
    for (const size of SIZES) {
      expect(humanZoneBox("FRONT_CENTER", size)).toMatchObject({ w: 20, h: 20 });
      expect(humanZoneBox("BACK", size)).toMatchObject({ w: 20, h: 20 });
      expect(humanZoneBox("RIGHT_UPPER_ARM", size)).toMatchObject({ w: 10, h: 10 });
    }
    // The same 20 cm print covers less of a 3XL than of an S.
    expect(20 / HUMAN_CHART.XXXL.chestWidthCm).toBeLessThan(20 / HUMAN_CHART.S.chestWidthCm);
  });

  it("puts the wearer's right sleeve on the viewer's left in the front view, and BACK on the back view", () => {
    expect(humanZoneBox("RIGHT_UPPER_ARM", "M")!.cx).toBeLessThan(0);
    expect(humanZoneBox("LEFT_UPPER_ARM", "M")!.cx).toBeGreaterThan(0);
    expect(zoneSide("BACK")).toBe("back");
    expect(zoneSide("RIGHT_UPPER_ARM")).toBe("front");
  });

  it("fits every zone inside its frame on every size", () => {
    for (const size of SIZES) {
      for (const zone of ["RIGHT_UPPER_ARM", "LEFT_UPPER_ARM", "FRONT_CENTER", "BACK"] as const) {
        const box = humanZoneBox(zone, size)!;
        expect(box.cx - box.w).toBeGreaterThan(HUMAN_FRAME.minX);
        expect(box.cx + box.w).toBeLessThan(HUMAN_FRAME.minX + HUMAN_FRAME.width);
      }
      const pet = petShirtShape(size);
      expect(pet.zone.cy + pet.zone.h / 2).toBeLessThan(pet.length);
      // Frames end just under the ruler, below the hem, and keep one width (one cm scale) for every size.
      expect(pet.length).toBeLessThan(petFrame(size).minY + petFrame(size).height);
      expect(humanFrame(size).width).toBe(HUMAN_FRAME.width);
    }
  });

  it("turns a zone box into CSS percentages of its frame", () => {
    const style = boxStyle({ cx: 0, cy: 22, w: 20, h: 20, rotate: 0 }, HUMAN_FRAME);
    expect(parseFloat(style.left)).toBeCloseTo(((-10 + 48) / 96) * 100, 3);
    expect(parseFloat(style.width)).toBeCloseTo((20 / 96) * 100, 3);
    expect(style.transform).toBeUndefined();
    expect(boxStyle({ cx: 30, cy: 15, w: 10, h: 10, rotate: 31 }, HUMAN_FRAME).transform).toBe("rotate(31deg)");
  });
});

describe("Set Pet reel (X7)", () => {
  const reel = { video: "/api/uploads/cms/media/bundle-abc.webm", poster: "/api/uploads/cms/media/bundle-abc.webp", durationS: 90, width: 1280, height: 720 };
  it("plays only our own CMS media files", () => {
    expect(setPetReel("fa", { fa: reel })).toEqual(reel);
    expect(setPetReel("fa", { fa: { ...reel, video: "https://opetlife.ir/api/uploads/cms/media/bundle-abc.webm" } })).not.toBeNull();
    expect(setPetReel("fa", { fa: { ...reel, video: "https://evil.example/x.webm" } })).toBeNull();
    expect(setPetReel("fa", { fa: { ...reel, poster: "javascript:alert(1)" } })).toBeNull();
    expect(setPetReel("en", { fa: reel })).toBeNull();
  });
});
