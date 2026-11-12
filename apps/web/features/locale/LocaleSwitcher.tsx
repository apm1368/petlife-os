"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n/config";

/** Language names in the language of the current page, so the visible UI never mixes languages. */
const LANGUAGE_NAMES: Record<string, Record<string, string>> = {
  fa: { fa: "فارسی", en: "انگلیسی", de: "آلمانی", es: "اسپانیایی", ar: "عربی", nl: "هلندی" },
  en: { fa: "Persian", en: "English", de: "German", es: "Spanish", ar: "Arabic", nl: "Dutch" },
  de: { fa: "Persisch", en: "Englisch", de: "Deutsch", es: "Spanisch", ar: "Arabisch", nl: "Niederländisch" },
  es: { fa: "persa", en: "inglés", de: "alemán", es: "español", ar: "árabe", nl: "neerlandés" },
  ar: { fa: "الفارسية", en: "الإنجليزية", de: "الألمانية", es: "الإسبانية", ar: "العربية", nl: "الهولندية" },
  nl: { fa: "Perzisch", en: "Engels", de: "Duits", es: "Spaans", ar: "Arabisch", nl: "Nederlands" },
};

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
      aria-label={LANGUAGE_NAMES[locale]?.[locale] ?? "Language"}
      value={locale}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_NAMES[locale]?.[l] ?? LANGUAGE_NAMES.en?.[l] ?? l}
        </option>
      ))}
    </select>
  );
}
