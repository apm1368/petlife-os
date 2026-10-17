"use client";

import { useLocale } from "next-intl";
import { statusLabel, statusTone, type StatusDomain } from "./status-labels";

/** Locale-bound status helpers for components: `status.label(code, "lab")`, `status.tone(code, "lab")`. */
export function useStatusText() {
  const locale = useLocale() === "en" ? "en" : "fa";
  return {
    label: (code: string | null | undefined, domain?: StatusDomain) => statusLabel(code, locale, domain),
    tone: (code: string | null | undefined, domain?: StatusDomain) => statusTone(code, domain),
  };
}
