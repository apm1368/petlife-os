import type { SetPetSize, SetPetZone } from "@petlife/types";
import { HUMAN_CHART, PET_CHART, ZONE_CM } from "./set-pet-catalog";

/**
 * Garment mockups in centimetres, so the fixed print areas (10×10 cm sleeves, 20×20 cm front/back) keep their true
 * scale on every size: a 20 cm print looks smaller on a 3XL than on an S, as it will in real life.
 * Coordinates: x = 0 is the garment's centre line, y = 0 the shoulder line; the drawing is never mirrored for RTL.
 */
export type Box = { cx: number; cy: number; w: number; h: number; rotate: number };

/** One frame for every human size (the largest size fits), so sizes compare honestly; the cm ruler sits under it. */
export const HUMAN_FRAME = { minX: -48, minY: -3, width: 96, height: 96 };
/** One frame for every pet size, ruler included. */
export const PET_FRAME = { minX: -26, minY: -3, width: 52, height: 80 };

/** A cm ruler (owner, #368 P34): ticks every cm, longer every 5, numbered every 10. */
export function rulerTicks(fromX: number, lengthCm: number) {
  return Array.from({ length: lengthCm + 1 }, (_, cm) => ({ x: fromX + cm, size: cm % 10 === 0 ? 2.6 : cm % 5 === 0 ? 1.8 : 1, label: cm % 10 === 0 ? cm : null }));
}
export const HUMAN_RULER = { y: 85, fromX: -25, lengthCm: 50 };
export const PET_RULER = { y: 67, fromX: -20, lengthCm: 40 };

const SLEEVE_ANGLE = 31; // degrees: the sleeve's slope on the flat-laid shirt

export function humanShirtPath(size: SetPetSize, side: "front" | "back"): string {
  const { chestWidthCm, lengthCm } = HUMAN_CHART[size];
  const half = chestWidthCm / 2;
  const shoulder = half * 0.92;
  const neck = 9;
  const drop = side === "front" ? 16 : 5; // quadratic control: the neckline dips half of this
  const pts = (sign: 1 | -1) => [
    [sign * shoulder, 2.5],
    [sign * (half + 14), 12],
    [sign * (half + 6), 26],
    [sign * half, 22],
    [sign * half, lengthCm],
  ];
  const right = pts(1).map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(" ");
  const left = pts(-1).reverse().map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(" ");
  return `M${-neck} 0 Q0 ${drop} ${neck} 0 ${right} ${left} Z`;
}

/** The collar band, drawn on top of the body. */
export function humanCollarPath(side: "front" | "back"): string {
  return side === "front" ? "M-9 0 Q0 16 9 0" : "M-9 0 Q0 5 9 0";
}

/**
 * Print zones on the flat-laid shirt. The wearer's RIGHT sleeve is on the viewer's LEFT in the front view.
 * Sleeves are shown on the front view; BACK only on the back view.
 */
export function humanZoneBox(zone: SetPetZone, size: SetPetSize): Box | null {
  const half = HUMAN_CHART[size].chestWidthCm / 2;
  const sleeveX = (half * 0.92 + (half + 14) + (half + 6) + half) / 4;
  const sleeveY = (2.5 + 12 + 26 + 22) / 4;
  const cm = ZONE_CM[zone] ?? 0;
  switch (zone) {
    case "RIGHT_UPPER_ARM":
      return { cx: -sleeveX, cy: sleeveY, w: cm, h: cm, rotate: -SLEEVE_ANGLE };
    case "LEFT_UPPER_ARM":
      return { cx: sleeveX, cy: sleeveY, w: cm, h: cm, rotate: SLEEVE_ANGLE };
    case "FRONT_CENTER":
      return { cx: 0, cy: 12 + cm / 2, w: cm, h: cm, rotate: 0 };
    case "BACK":
      return { cx: 0, cy: 7 + cm / 2, w: cm, h: cm, rotate: 0 };
    default:
      return null;
  }
}

const mid = (range: readonly [number, number]) => (range[0] + range[1]) / 2;

/** The pet garment seen from above (the pet's back): collar at the top, the tail end at the bottom. */
export function petShirtShape(size: SetPetSize) {
  const chart = PET_CHART[size];
  const collar = mid(chart.neckCm) * 0.17;
  const body = mid(chart.chestCm) * 0.27;
  const length = mid(chart.backLengthCm);
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
  return { path, collar: `M${-collar} 0 Q0 3 ${collar} 0`, zone, length };
}

/** A zone box as CSS percentages of its mockup frame (for the HTML <img> overlay). */
export function boxStyle(box: Box, frame: { minX: number; minY: number; width: number; height: number }) {
  return {
    left: `${((box.cx - box.w / 2 - frame.minX) / frame.width) * 100}%`,
    top: `${((box.cy - box.h / 2 - frame.minY) / frame.height) * 100}%`,
    width: `${(box.w / frame.width) * 100}%`,
    height: `${(box.h / frame.height) * 100}%`,
    transform: box.rotate ? `rotate(${box.rotate}deg)` : undefined,
  };
}
