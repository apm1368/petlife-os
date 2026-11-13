import { SET_PET_MEASUREMENT_RANGES, SET_PET_SIZES, type SetPetMeasurements, type SetPetSize, type SetPetZone } from "@petlife/types";

/**
 * «ست پت» Set Pet catalogue for the member builder (owner, 2026-11-13). The charts are approximate: staff confirm every
 * size, colour and print area with the quote before anything is printed.
 */

export const SIZES = SET_PET_SIZES;

/** XXL and XXXL are shown as 2XL and 3XL. */
export const sizeLabel = (size: SetPetSize) => (size === "XXL" ? "2XL" : size === "XXXL" ? "3XL" : size);

/** Human T-shirt, laid flat: chest width (armpit to armpit) and length (shoulder to hem), cm. */
export const HUMAN_CHART: Record<SetPetSize, { chestWidthCm: number; lengthCm: number }> = {
  S: { chestWidthCm: 48, lengthCm: 70 },
  M: { chestWidthCm: 51, lengthCm: 72 },
  L: { chestWidthCm: 54, lengthCm: 74 },
  XL: { chestWidthCm: 57, lengthCm: 76 },
  XXL: { chestWidthCm: 60, lengthCm: 78 },
  XXXL: { chestWidthCm: 63, lengthCm: 80 },
};

type Range = readonly [number, number];
/** Pet garment: neck girth, chest girth (just behind the front legs) and back length (neck base to tail base), cm. */
export const PET_CHART: Record<SetPetSize, { neckCm: Range; chestCm: Range; backLengthCm: Range }> = {
  S: { neckCm: [22, 28], chestCm: [32, 40], backLengthCm: [25, 30] },
  M: { neckCm: [28, 34], chestCm: [40, 48], backLengthCm: [30, 36] },
  L: { neckCm: [34, 40], chestCm: [48, 56], backLengthCm: [36, 42] },
  XL: { neckCm: [40, 46], chestCm: [56, 64], backLengthCm: [42, 48] },
  XXL: { neckCm: [46, 52], chestCm: [64, 74], backLengthCm: [48, 56] },
  XXXL: { neckCm: [52, 60], chestCm: [74, 86], backLengthCm: [56, 64] },
};

/** The garment that fits best is chosen by chest girth (the snuggest part); then back length breaks ties. */
export function suggestPetSize(chestCm: number | null): SetPetSize | null {
  if (chestCm == null || !Number.isFinite(chestCm)) return null;
  const hit = SIZES.find((size) => chestCm >= PET_CHART[size].chestCm[0] && chestCm < PET_CHART[size].chestCm[1]);
  if (hit) return hit;
  if (chestCm < PET_CHART.S.chestCm[0]) return "S";
  if (chestCm >= PET_CHART.XXXL.chestCm[1]) return "XXXL";
  return null;
}

/** Six base colours (owner, #368 P12); staff confirm the exact shade with the quote. */
export const COLOURS = [
  { id: "white", hex: "#FFFFFF" },
  { id: "black", hex: "#1E1F1D" },
  { id: "heather-grey", hex: "#B9BDBA" },
  { id: "navy", hex: "#22304A" },
  { id: "cream", hex: "#F3E9D2" },
  { id: "sage", hex: "#A9B9A0" },
] as const;
export type ColourId = (typeof COLOURS)[number]["id"];
export const colourHex = (id: string) => COLOURS.find((c) => c.id === id)?.hex ?? "#FFFFFF";
/** Dark garments get light outlines and labels in the mockups. */
export const isDarkColour = (id: string) => id === "black" || id === "navy";

export const HUMAN_ZONES = ["RIGHT_UPPER_ARM", "LEFT_UPPER_ARM", "FRONT_CENTER", "BACK"] as const satisfies readonly SetPetZone[];
export const ALL_ZONES = [...HUMAN_ZONES, "PET_BACK"] as const satisfies readonly SetPetZone[];
/** Print area per zone, cm (the pet's back area is fitted by staff to the garment size). */
export const ZONE_CM: Record<SetPetZone, number | null> = { RIGHT_UPPER_ARM: 10, LEFT_UPPER_ARM: 10, FRONT_CENTER: 20, BACK: 20, PET_BACK: null };
/** Which mockup side shows a zone: sleeves and the front centre on the front, BACK on the back. */
export const zoneSide = (zone: SetPetZone): "front" | "back" => (zone === "BACK" ? "back" : "front");

/** Previews render only raster images (PNG/JPEG/WebP) and only as <img>; print files are never drawn on the page. */
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const RASTER_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
export const isRasterPreviewable = (file: { name: string; type: string }) => RASTER_TYPES.has(file.type) && RASTER_EXTENSIONS.test(file.name);

export type MeasurementKey = keyof SetPetMeasurements;
export const MEASUREMENT_KEYS = ["neckCm", "chestCm", "backLengthCm", "weightKg"] as const satisfies readonly MeasurementKey[];
export const MEASUREMENT_RANGES = SET_PET_MEASUREMENT_RANGES;

/** Parses a typed measurement (Persian/Arabic digits and either decimal mark), or null when empty or not a number. */
export function parseMeasurement(raw: string): number | null {
  const ascii = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, ".");
  if (!ascii || !/^\d+(\.\d+)?$/.test(ascii)) return null;
  return Number(ascii);
}

/** "ok", "empty" or "range" for one measurement; the API refuses anything outside the plausible range. */
export function checkMeasurement(key: MeasurementKey, value: number | null): "ok" | "empty" | "range" {
  if (value == null) return "empty";
  const { min, max } = MEASUREMENT_RANGES[key];
  return value >= min && value <= max ? "ok" : "range";
}

/** The API stores one decimal for cm and two for kg. */
export const roundMeasurement = (key: MeasurementKey, value: number) => (key === "weightKg" ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10);

/**
 * A unisex T-shirt size from height and weight (owner, #368 P16): by weight, one size up for tall people and one down
 * for short ones. Only a suggestion; the member picks, and a different pick is never blocked (P20).
 */
export function suggestHumanSize(heightCm: number | null, weightKg: number | null): SetPetSize | null {
  if (weightKg == null || weightKg < 25 || weightKg > 250) return null;
  const byWeight = weightKg < 60 ? 0 : weightKg < 72 ? 1 : weightKg < 84 ? 2 : weightKg < 96 ? 3 : weightKg < 110 ? 4 : 5;
  const shift = heightCm == null || heightCm < 100 || heightCm > 230 ? 0 : heightCm >= 186 ? 1 : heightCm < 160 ? -1 : 0;
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, byWeight + shift))];
}

/** Print quality: pixels across the print width, as dots per inch (150 dpi or more prints sharp). */
export const printDpi = (pixels: number, cm: number) => Math.round(pixels / (cm / 2.54));
export const MIN_SHARP_DPI = 150;

/** Until a visitor signs in (options need a session), the builder runs on the API's published limits. */
export const DEFAULT_LIMITS = {
  acceptedExtensions: ["jpg", "jpeg", "png", "webp", "heic", "pdf", "svg", "ai", "psd"],
  maxFileBytes: 50 * 1024 * 1024,
  maxDesigns: 3,
  /** Owner, #368 P9: up to five human garments in one set. */
  maxHumanGarments: 5,
};
