"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n/config";

/** Language names in the language of the current page, so the visible UI never mixes languages. */
const LANGUAGE_NAMES = { fa: { fa: "فارسی", en: "انگلیسی" }, en: { fa: "Persian", en: "English" } } as const;

/** Swaps the leading /fa or /en path segment, preserving the rest of the URL. */
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
      aria-label={locale === "fa" ? "زبان" : "Language"}
      value={locale}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_NAMES[locale === "fa" ? "fa" : "en"][l as "fa" | "en"]}
        </option>
      ))}
    </select>
  );
}
