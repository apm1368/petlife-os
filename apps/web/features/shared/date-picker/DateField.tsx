"use client";

import { DateRangeField } from "./DateRangePicker";

const PAST_FLOOR = "1900-01-01";

/**
 * One calendar day, picked in the canonical PET LIFE picker: Jalali with Persian digits in fa,
 * Gregorian in en. The value stays an ISO day ("2026-10-04") — only presentation changes.
 */
export function DateField({ label, value, onChange, min, max, placeholder, error, className }: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  error?: string | null;
  className?: string;
}) {
  return (
    <DateRangeField
      mode="single"
      label={label}
      placeholder={placeholder}
      error={error}
      className={className}
      // A field capped by `max` but given no `min` records the past (a memory, a last vaccination):
      // open the calendar to history. Without either bound the shared picker keeps its today-onwards floor.
      min={min ?? (max ? PAST_FLOOR : undefined)}
      max={max}
      value={{ start: value || null, end: null }}
      onChange={(v) => onChange(v.start ?? "")}
    />
  );
}
