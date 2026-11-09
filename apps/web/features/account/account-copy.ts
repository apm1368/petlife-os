"use client";
import { useLocale } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";

/** Small account views may keep short copy inline while the catalog rollout is in progress. */
export function useAccountCopy() {
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const numberFormat = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale);
  /** Counts in the locale's digits (Persian digits in fa). */
  const num = (value: number) => numberFormat.format(value);
  const t = (faText: string, enText: string, deText = enText, esText = enText) =>
    locale === "fa" ? faText : locale === "de" ? deText : locale === "es" ? esText : enText;
  return { locale, fa, num, t };
}

export function formatAccountDate(value: string | Date, locale: RouteLocale, withTime = false): string {
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale;
  return new Intl.DateTimeFormat(dateLocale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}
