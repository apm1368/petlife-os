"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import type { AdminOrderSection } from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";

const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES" };
const humanize = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

/** Labels and formats shared by the orders list, the drawer and its tests. Unknown codes read as plain words. */
export function useOrderLabels() {
  const t = useTranslations("adminOrders");
  const locale = useLocale() as RouteLocale;
  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" });
    const date = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { dateStyle: "medium", timeZone: "Asia/Tehran" });
    const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : DATE_LOCALE[locale]);
    const code = (v: string | null | undefined, section?: AdminOrderSection) => {
      if (!v) return "—";
      // Only enum-like codes are labels; free text (variant names, reasons) is shown as written.
      if (!/^[A-Z][A-Z0-9_]*$/.test(v)) return v;
      if (section && t.has(`status.${section}.${v}`)) return t(`status.${section}.${v}`);
      return t.has(`codes.${v}`) ? t(`codes.${v}`) : humanize(v);
    };
    return {
      locale,
      section: (s: AdminOrderSection) => t(`sections.${s}`),
      code,
      money: (irr: number | null | undefined) => (irr === null || irr === undefined ? "—" : formatCurrency(irr, locale)),
      dateTime: (v: string | null | undefined) => (v ? dateTime.format(new Date(v)) : "—"),
      date: (v: string | null | undefined) => (v ? date.format(new Date(v)) : "—"),
      number: (v: number) => number.format(v),
    };
  }, [t, locale]);
}
