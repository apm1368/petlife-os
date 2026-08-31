"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n/config";

/** Swaps the leading /fa or /en path segment, preserving the rest of the URL. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function onChange(nextLocale: string) {
    const segments = pathname.split("/");
    segments[1] = nextLocale;
    router.push(segments.join("/") || "/");
  }

  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
