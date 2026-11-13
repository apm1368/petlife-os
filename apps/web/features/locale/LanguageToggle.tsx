"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n/config";
import { languageLabel, languageOptionName } from "./locale-names";


/** Changes only the locale path segment, retaining the current page, query, fragment and theme. */
export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <select
      className="language-toggle"
      aria-label={languageLabel(locale)}
      value={locale}
      onChange={(event) => {
        const segments = pathname.split("/");
        segments[1] = event.target.value;
        router.push((segments.join("/") || "/") + window.location.search + window.location.hash);
      }}
    >
      {locales.map((code) => <option key={code} value={code}>{languageOptionName(locale, code)}</option>)}
    </select>
  );
}
