"use client";
import { useLocale } from "next-intl";

/** Account pages carry their own fa/en copy inline (as the Batch 1 account views do); this keeps call sites readable. */
export function useAccountCopy() {
  const locale = useLocale();
  const fa = locale === "fa";
  const numberFormat = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  /** Counts in the locale's digits (Persian digits in fa). */
  const num = (value: number) => numberFormat.format(value);
  return { locale, fa, num, t: (faText: string, enText: string) => (fa ? faText : enText) };
}

export function formatAccountDate(value: string | Date, locale: string, withTime = false): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}
