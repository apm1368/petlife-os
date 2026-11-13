import {
  SET_PET_COLOURS,
  SET_PET_HUMAN_GARMENTS,
  SET_PET_PET_GARMENTS,
  SET_PET_SIZES,
  SET_PET_ZONES,
  type SetPetGarment,
  type SetPetSize,
  type SetPetZone,
} from "@petlife/types";

/**
 * «ست پت» Set Pet catalogue for the builder (owner's #368 answers). The charts are approximate; staff confirm every size,
 * colour and print area in the print proof before anything is printed.
 */

export const SIZES = SET_PET_SIZES;
export const HUMAN_GARMENTS = SET_PET_HUMAN_GARMENTS;
export const PET_GARMENTS = SET_PET_PET_GARMENTS;

/** XXL and XXXL are shown as 2XL and 3XL. */
export const sizeLabel = (size: SetPetSize) => (size === "XXL" ? "2XL" : size === "XXXL" ? "3XL" : size);

/** Human garment, laid flat: chest width (armpit to armpit) and length (shoulder to hem), cm. Unisex, cotton (P14/P15). */
export const HUMAN_CHART: Record<SetPetSize, { chestWidthCm: number; lengthCm: number }> = {
  S: { chestWidthCm: 48, lengthCm: 70 },
  M: { chestWidthCm: 51, lengthCm: 72 },
  L: { chestWidthCm: 54, lengthCm: 74 },
  XL: { chestWidthCm: 57, lengthCm: 76 },
  XXL: { chestWidthCm: 60, lengthCm: 78 },
  XXXL: { chestWidthCm: 63, lengthCm: 80 },
};

type Range = readonly [number, number];
/**
 * Pet garment guide (owner P17): the member picks the size LETTER; this chart (neck girth, chest girth just behind the
 * front legs, back length from neck base to tail base, cm) only guides. No breed suggestion (P19).
 */
export const PET_CHART: Record<SetPetSize, { neckCm: Range; chestCm: Range; backLengthCm: Range }> = {
  S: { neckCm: [22, 28], chestCm: [32, 40], backLengthCm: [25, 30] },
  M: { neckCm: [28, 34], chestCm: [40, 48], backLengthCm: [30, 36] },
  L: { neckCm: [34, 40], chestCm: [48, 56], backLengthCm: [36, 42] },
  XL: { neckCm: [40, 46], chestCm: [56, 64], backLengthCm: [42, 48] },
  XXL: { neckCm: [46, 52], chestCm: [64, 74], backLengthCm: [48, 56] },
  XXXL: { neckCm: [52, 60], chestCm: [74, 86], backLengthCm: [56, 64] },
};

/**
 * Owner P20: a size that doesn't match the pet's recorded weight only warns. A rough weight band per letter (kg) for
 * dogs and cats; outside it by more than one letter, the member sees a note.
 */
const PET_WEIGHT_KG: Record<SetPetSize, Range> = { S: [0, 5], M: [4, 10], L: [9, 18], XL: [16, 28], XXL: [25, 40], XXXL: [36, 100] };
export function petSizeMismatch(size: SetPetSize, weightKg: number | null | undefined): boolean {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return false;
  const [lo, hi] = PET_WEIGHT_KG[size];
  return weightKg < lo * 0.8 || weightKg > hi * 1.25;
}

/** The six base colours (owner P12); staff confirm the exact shade in the proof. */
export const COLOURS = Object.entries(SET_PET_COLOURS).map(([id, hex]) => ({ id, hex }));
export type ColourId = keyof typeof SET_PET_COLOURS;
export const colourHex = (id: string) => (SET_PET_COLOURS as Record<string, string>)[id] ?? "#FFFFFF";
/** Dark garments get light outlines and labels in the mockups. */
export const isDarkColour = (id: string) => id === "black" || id === "navy";

export const HUMAN_ZONES = ["RIGHT_UPPER_ARM", "LEFT_UPPER_ARM", "FRONT_CENTER", "BACK"] as const satisfies readonly SetPetZone[];
export const ALL_ZONES = [...HUMAN_ZONES, "PET_BACK"] as const satisfies readonly SetPetZone[];
/** Print area per zone, cm (the pet's back area is fitted by staff in the proof, P28). */
export const ZONE_CM: Record<SetPetZone, number | null> = Object.fromEntries(Object.entries(SET_PET_ZONES).map(([zone, z]) => [zone, z.widthCm])) as Record<SetPetZone, number | null>;
/** Which mockup side shows a zone: sleeves and the front centre on the front, BACK on the back. */
export const zoneSide = (zone: SetPetZone): "front" | "back" => (zone === "BACK" ? "back" : "front");

export const isPetGarment = (garment: SetPetGarment) => garment.startsWith("PET_");

/** Previews render only raster images (PNG/JPEG/WebP) and only as <img>; print files are never drawn on the page. */
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const RASTER_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
export const isRasterPreviewable = (file: { name: string; type: string }) => RASTER_TYPES.has(file.type) && RASTER_EXTENSIONS.test(file.name);

/** Parses a typed number (Persian/Arabic digits and either decimal mark), or null when empty or not a number. */
export function parseNumber(raw: string): number | null {
  const ascii = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, ".");
  if (!ascii || !/^\d+(\.\d+)?$/.test(ascii)) return null;
  return Number(ascii);
}

/**
 * A unisex size from height and weight (owner P16): by weight, one size up for tall people and one down for short
 * ones. Only a suggestion; the member picks, and a different pick is never blocked (P20).
 */
export function suggestHumanSize(heightCm: number | null, weightKg: number | null): SetPetSize | null {
  if (weightKg == null || weightKg < 25 || weightKg > 250) return null;
  const byWeight = weightKg < 60 ? 0 : weightKg < 72 ? 1 : weightKg < 84 ? 2 : weightKg < 96 ? 3 : weightKg < 110 ? 4 : 5;
  const shift = heightCm == null || heightCm < 100 || heightCm > 230 ? 0 : heightCm >= 186 ? 1 : heightCm < 160 ? -1 : 0;
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, byWeight + shift))] ?? null;
}

/** Print quality: pixels across the visible print width, as dots per inch (150 dpi or more prints sharp; P26 warns). */
export const printDpi = (pixels: number, cm: number) => Math.round(pixels / (cm / 2.54));
export const MIN_SHARP_DPI = 150;

/** Toman, the way Iranians read prices (the API counts IRR). */
export const irrToToman = (irr: number) => Math.round(irr / 10);
