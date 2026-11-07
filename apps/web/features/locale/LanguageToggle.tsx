"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

const localeNames = {
  fa: { label: "زبان", fa: "فارسی", en: "انگلیسی", de: "آلمانی", es: "اسپانیایی" },
  en: { label: "Language", fa: "Persian", en: "English", de: "German", es: "Spanish" },
  de: { label: "Sprache", fa: "Persisch", en: "Englisch", de: "Deutsch", es: "Spanisch" },
  es: { label: "Idioma", fa: "persa", en: "inglés", de: "alemán", es: "español" },
} as const;

/** Changes only the locale path segment, retaining the current page, query, fragment and theme. */
export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const names = localeNames[locale as keyof typeof localeNames] ?? localeNames.en;
  return (
    <select
      className="language-toggle"
      aria-label={names.label}
      value={locale}
      onChange={(event) => {
        const segments = pathname.split("/");
        segments[1] = event.target.value;
        router.push((segments.join("/") || "/") + window.location.search + window.location.hash);
      }}
    >
      {(["fa", "en", "de", "es"] as const).map((code) => <option key={code} value={code}>{names[code]}</option>)}
    </select>
  );
}
