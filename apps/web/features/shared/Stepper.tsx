"use client";

import { useLocale } from "next-intl";
import { formatCount } from "@/lib/number/format-number";

/**
 * Progress through a multi-step flow (booking, checkout): numbered marks joined by a line, with
 * done / current / upcoming states. Mirrors with the document direction; the current step is
 * announced as aria-current="step".
 */
export function Stepper({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  const locale = useLocale();
  return (
    <ol className="stepper" aria-label={label}>
      {steps.map((name, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li key={name} className={`stepper__step stepper__step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper__mark" aria-hidden="true">{state === "done" ? "✓" : formatCount(i + 1, locale)}</span>
            <span className="stepper__label">{name}</span>
          </li>
        );
      })}
    </ol>
  );
}
