"use client";

import { useId } from "react";
import type { VitalsTrendPointDto } from "@petlife/types";

/**
 * A deliberately minimal trend line: one dot per *actual* measurement, joined
 * in order. Nothing is smoothed, interpolated, or gap-filled — a series with
 * three readings taken months apart draws three dots, not a confident curve,
 * so the picture cannot suggest data that was never recorded.
 *
 * There is no reference band and no colour-coded "normal" zone: this codebase
 * does not interpret a measurement against a range (Handoff 17 principle 4).
 * The line is decorative; the accessible value is the text table beside it,
 * and the SVG itself carries the series as its aria-label rather than being
 * the only place the numbers exist.
 */
export function VitalsSparkline({ points, ariaLabel }: { points: VitalsTrendPointDto[]; ariaLabel: string }) {
  const gradientId = useId();
  if (points.length < 2) return null;

  const width = 280;
  const height = 64;
  const padding = 4;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A perfectly flat series would divide by zero; draw it as a mid-height line.
  const span = max - min || 1;

  const coords = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full"
      role="img"
      aria-label={`${ariaLabel}: ${points.map((p) => `${new Date(p.recordedAt).toLocaleDateString()} ${p.value.toFixed(1)}`).join(", ")}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke={`url(#${gradientId})`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-primary" />
      {coords.map((c, i) => (
        <circle key={points[i]!.recordedAt} cx={c.x} cy={c.y} r={2.5} className="fill-current text-text-primary" />
      ))}
    </svg>
  );
}
