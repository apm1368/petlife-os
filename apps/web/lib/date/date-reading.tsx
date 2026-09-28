"use client";

import { useLocale } from "next-intl";

/**
 * Native date inputs always render a Gregorian mm/dd/yyyy field. In the
 * Persian UI this shows the chosen day in the Jalali calendar right under
 * the field, so the customer never has to convert dates in their head.
 */
export function DateReading({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const locale = useLocale();
  if (!value || locale !== "fa") return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <span className={`text-metadata text-text-secondary ${className}`} aria-live="polite">
      {new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(date)}
    </span>
  );
}
