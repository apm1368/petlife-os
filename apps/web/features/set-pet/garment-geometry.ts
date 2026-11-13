import type { SetPetGarment, SetPetSize, SetPetZone } from "@petlife/types";
import { HUMAN_CHART, PET_CHART, ZONE_CM } from "./set-pet-catalog";

/**
 * Garment mockups in centimetres, so the fixed print areas (10×10 cm sleeves, 20×20 cm front/back) keep their true
 * scale on every size: a 20 cm print looks smaller on a 3XL than on an S, as it will in real life.
 * Coordinates: x = 0 is the garment's centre line, y = 0 the shoulder line; the drawing is never mirrored for RTL.
 */
export type Box = { cx: number; cy: number; w: number; h: number; rotate: number };

/**
 * One width for every size (the largest fits), so a centimetre is the same size on screen for every garment and sizes
 * compare honestly; the height follows the garment so there is no empty band, with the cm ruler just under the hem.
 */
export type Frame = { minX: number; minY: number; width: number; height: number };
export const HUMAN_FRAME: Frame = { minX: -48, minY: -3, width: 96, height: 96 };
export const PET_FRAME: Frame = { minX: -26, minY: -3, width: 52, height: 80 };
export const humanFrame = (size: SetPetSize): Frame => ({ ...HUMAN_FRAME, height: HUMAN_CHART[size].lengthCm + 16 });
export const petFrame = (size: SetPetSize, garment: SetPetGarment = "PET_TEE"): Frame => ({ ...PET_FRAME, height: petShirtShape(size, garment).length + 15 });
export const humanRuler = (size: SetPetSize) => ({ y: HUMAN_CHART[size].lengthCm + 5, fromX: -25, lengthCm: 50 });
export const petRuler = (size: SetPetSize, garment: SetPetGarment = "PET_TEE") => ({ y: petShirtShape(size, garment).length + 5, fromX: -20, lengthCm: 40 });

/** A cm ruler (owner, #368 P34): ticks every cm, longer every 5, numbered every 10. */
export function rulerTicks(fromX: number, lengthCm: number) {
  return Array.from({ length: lengthCm + 1 }, (_, cm) => ({ x: fromX + cm, size: cm % 10 === 0 ? 2.6 : cm % 5 === 0 ? 1.8 : 1, label: cm % 10 === 0 ? cm : null }));
}


const SLEEVE_ANGLE = 31; // degrees: the sleeve's slope on the flat-laid shirt

/** The flat-laid outline of one side of the garment. Tees have short sleeves; hoodies and sweatshirts long ones. */
export function humanShirtPoints(size: SetPetSize, garment: SetPetGarment = "HUMAN_TEE"): Array<[number, number]> {
  const { chestWidthCm, lengthCm } = HUMAN_CHART[size];
  const half = chestWidthCm / 2;
  const shoulder = half * 0.92;
  const long = garment === "HUMAN_HOODIE" || garment === "HUMAN_SWEATSHIRT";
  const side = (sign: 1 | -1): Array<[number, number]> =>
    long
      ? [[sign * shoulder, 2.5], [sign * (half + 24), 46], [sign * (half + 16), 50], [sign * half, 22], [sign * half, lengthCm]]
      : [[sign * shoulder, 2.5], [sign * (half + 14), 12], [sign * (half + 6), 26], [sign * half, 22], [sign * half, lengthCm]];
  return [...side(1), ...side(-1).reverse()];
}

export function humanShirtPath(size: SetPetSize, side: "front" | "back", garment: SetPetGarment = "HUMAN_TEE"): string {
  const neck = 9;
  const drop = side === "front" ? 16 : 5; // quadratic control: the neckline dips half of this
  const pts = humanShirtPoints(size, garment).map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(" ");
  return `M${-neck} 0 Q0 ${drop} ${neck} 0 ${pts} Z`;
}

/** Hood (hoodie) folded behind the neck, and the ribbed hem/cuffs of a sweatshirt or hoodie. */
export function humanExtrasPath(size: SetPetSize, side: "front" | "back", garment: SetPetGarment): string | null {
  const { chestWidthCm, lengthCm } = HUMAN_CHART[size];
  const half = chestWidthCm / 2;
  const parts: string[] = [];
  if (garment === "HUMAN_HOODIE") parts.push(side === "back" ? "M-11 1 Q-13 26 0 28 Q13 26 11 1" : "M-11 0 Q0 -6 11 0", side === "front" ? `M-12 ${lengthCm - 22} L12 ${lengthCm - 22} L15 ${lengthCm - 6} L-15 ${lengthCm - 6} Z` : "");
  if (garment === "HUMAN_HOODIE" || garment === "HUMAN_SWEATSHIRT") parts.push(`M${-half} ${lengthCm - 5} L${half} ${lengthCm - 5}`);
  const path = parts.filter(Boolean).join(" ");
  return path || null;
}

/** The collar band, drawn on top of the body. */
export function humanCollarPath(side: "front" | "back"): string {
  return side === "front" ? "M-9 0 Q0 16 9 0" : "M-9 0 Q0 5 9 0";
}

/**
 * Print zones on the flat-laid shirt. The wearer's RIGHT sleeve is on the viewer's LEFT in the front view.
 * Sleeves are shown on the front view; BACK only on the back view.
 */
export function humanZoneBox(zone: SetPetZone, size: SetPetSize, garment: SetPetGarment = "HUMAN_TEE"): Box | null {
  const half = HUMAN_CHART[size].chestWidthCm / 2;
  const long = garment === "HUMAN_HOODIE" || garment === "HUMAN_SWEATSHIRT";
  // The upper arm: on a long sleeve it sits a little lower along the sleeve.
  const sleeveX = long ? half + 9 : (half * 0.92 + (half + 14) + (half + 6) + half) / 4;
  const sleeveY = long ? 19 : (2.5 + 12 + 26 + 22) / 4;
  const angle = long ? 58 : SLEEVE_ANGLE;
  const cm = ZONE_CM[zone] ?? 0;
  switch (zone) {
    case "RIGHT_UPPER_ARM":
      return { cx: -sleeveX, cy: sleeveY, w: cm, h: cm, rotate: -angle };
    case "LEFT_UPPER_ARM":
      return { cx: sleeveX, cy: sleeveY, w: cm, h: cm, rotate: angle };
    case "FRONT_CENTER":
      return { cx: 0, cy: 12 + cm / 2, w: cm, h: cm, rotate: 0 };
    case "BACK":
      return { cx: 0, cy: 7 + cm / 2, w: cm, h: cm, rotate: 0 };
    default:
      return null;
  }
}

const mid = (range: readonly [number, number]) => (range[0] + range[1]) / 2;

/** The pet garment seen from above (the pet's back): collar at the top, the tail end at the bottom; a bandana is a triangle. */
export function petShirtShape(size: SetPetSize, garment: SetPetGarment = "PET_TEE") {
  const chart = PET_CHART[size];
  const collar = mid(chart.neckCm) * 0.17;
  const body = mid(chart.chestCm) * 0.27;
  const length = mid(chart.backLengthCm);
  if (garment === "PET_BANDANA") {
    const w = mid(chart.neckCm) * 0.42;
    const h = w * 0.85;
    const path = `M${(-w).toFixed(1)} 0 L${w.toFixed(1)} 0 L0 ${h.toFixed(1)} Z`;
    const sideCm = h * 0.5;
    const zone: Box = { cx: 0, cy: h * 0.36, w: sideCm, h: sideCm, rotate: 0 };
    return { path, collar: `M${(-w - 4).toFixed(1)} 0 L${(w + 4).toFixed(1)} 0`, zone, length: h, hood: null as string | null };
  }
  const path = [
    `M${-collar} 0 Q0 3 ${collar} 0`,
    `L${(body * 0.82).toFixed(1)} ${(length * 0.16).toFixed(1)}`,
    `Q${body.toFixed(1)} ${(length * 0.28).toFixed(1)} ${body.toFixed(1)} ${(length * 0.45).toFixed(1)}`,
    `L${(body * 0.94).toFixed(1)} ${(length * 0.84).toFixed(1)}`,
    `Q${(body * 0.6).toFixed(1)} ${length.toFixed(1)} 0 ${length.toFixed(1)}`,
    `Q${(-body * 0.6).toFixed(1)} ${length.toFixed(1)} ${(-body * 0.94).toFixed(1)} ${(length * 0.84).toFixed(1)}`,
    `L${(-body).toFixed(1)} ${(length * 0.45).toFixed(1)}`,
    `Q${(-body).toFixed(1)} ${(length * 0.28).toFixed(1)} ${(-body * 0.82).toFixed(1)} ${(length * 0.16).toFixed(1)}`,
    "Z",
  ].join(" ");
  const side = Math.min(body * 1.15, length * 0.42);
  const zone: Box = { cx: 0, cy: length * 0.5, w: side, h: side, rotate: 0 };
  const hood = garment === "PET_HOODIE" ? `M${(-collar * 1.3).toFixed(1)} 0 Q0 ${(-collar * 1.6).toFixed(1)} ${(collar * 1.3).toFixed(1)} 0` : null;
  return { path, collar: `M${-collar} 0 Q0 3 ${collar} 0`, zone, length, hood };
}

/** Points along the pet garment outline (for the 3D preview), from the same measurements as the 2D path. */
export function petShirtPoints(size: SetPetSize, garment: SetPetGarment = "PET_TEE"): Array<[number, number]> {
  const chart = PET_CHART[size];
  if (garment === "PET_BANDANA") {
    const w = mid(chart.neckCm) * 0.42;
    return [[-w, 0], [w, 0], [0, w * 0.85]];
  }
  const collar = mid(chart.neckCm) * 0.17;
  const body = mid(chart.chestCm) * 0.27;
  const length = mid(chart.backLengthCm);
  const right: Array<[number, number]> = [[collar, 0], [body * 0.82, length * 0.16], [body, length * 0.3], [body, length * 0.45], [body * 0.94, length * 0.84], [body * 0.55, length * 0.97], [0, length]];
  return [...right, ...right.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];
}

/** A zone box as CSS percentages of its mockup frame (for the HTML <img> overlay). */
export function boxStyle(box: Box, frame: Frame) {
  return {
    left: `${((box.cx - box.w / 2 - frame.minX) / frame.width) * 100}%`,
    top: `${((box.cy - box.h / 2 - frame.minY) / frame.height) * 100}%`,
    width: `${(box.w / frame.width) * 100}%`,
    height: `${(box.h / frame.height) * 100}%`,
    transform: box.rotate ? `rotate(${box.rotate}deg)` : undefined,
  };
}
