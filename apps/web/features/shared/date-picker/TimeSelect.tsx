"use client";

import { useLocale } from "next-intl";
import { Select } from "@petlife/ui";
import { localizeDigits } from "@/lib/date/jalali";

/**
 * An approximate time of day in half-hour steps, labelled in the UI language's digits. The native
 * time input renders in the browser's locale (AM/PM, Latin digits) whatever the page language is.
 * The value keeps the native "HH:MM" shape, or "" when not given.
 */
export function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (hhmm: string) => void }) {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const slots = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  return (
    <Select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: "", label: locale === "fa" ? "نامشخص" : "Not sure" }, ...slots.map((s) => ({ value: s, label: localizeDigits(s, locale) }))]}
    />
  );
}
