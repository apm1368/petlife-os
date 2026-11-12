"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n/config";
import { LANGUAGE_NAMES, languageOptionName } from "./locale-names";


/** Swaps the leading locale path segment, preserving the rest of the URL. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function onChange(nextLocale: string) {
    const segments = pathname.split("/");
    segments[1] = nextLocale;
    // Keep the query (filters, tabs) — switching language must change nothing else, theme included.
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.push((segments.join("/") || "/") + search);
  }

  return (
    <select
      aria-label={LANGUAGE_NAMES[locale as keyof typeof LANGUAGE_NAMES]?.label ?? "Language"}
      value={locale}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {languageOptionName(locale, l)}
        </option>
      ))}
    </select>
  );
}
