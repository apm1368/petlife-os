"use client";

import { DateRangeField } from "./DateRangePicker";

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
      min={min}
      max={max}
      value={{ start: value || null, end: null }}
      onChange={(v) => onChange(v.start ?? "")}
    />
  );
}
