import type { RouteLocale } from "@/lib/i18n/config";

const NUMBER_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR", en: "en-GB", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" };
const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian", en: "en-GB", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" };

export function asLocale(value: string): RouteLocale {
  return value === "en" || value === "de" || value === "es" ? value : "fa";
}

export function fmtNumber(value: number, locale: RouteLocale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], options).format(value);
}

/** Compact money: 12 500 000 → "۱۲٫۵ میلیون" / "12.5M". The currency word is added by the caller's copy. */
export function fmtCompact(value: number, locale: RouteLocale) {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function fmtPercent(value: number, locale: RouteLocale, digits = 1) {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { style: "percent", maximumFractionDigits: digits }).format(value);
}

/** A Tehran calendar date key (YYYY-MM-DD) shown in the viewer's calendar — Persian for fa. */
export function fmtDay(key: string, locale: RouteLocale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { ...options, timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}

export function fmtDateTime(iso: string, locale: RouteLocale) {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso));
}

/** Today in Tehran as YYYY-MM-DD (fixed UTC+03:30). */
export function tehranToday(now = new Date()) {
  return new Date(now.getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
}

export function shiftDays(key: string, days: number) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** RFC 4180 CSV with a BOM so Excel opens Persian text correctly. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
