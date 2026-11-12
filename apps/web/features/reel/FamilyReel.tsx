"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { isRouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { oplCopy } from "@/features/landing/opl/opl-copy";
import { ReelSection } from "./ReelSection";
import { familyForPath } from "./family-copy";
import { buildFamilyReel } from "./family-scenes";

/** The reel of the current page family (pattern-2026-11/pages.md), shown at the end of every public page in that family. */
export function FamilyReel() {
  const pathname = usePathname() ?? "";
  const raw = useLocale();
  const locale = isRouteLocale(raw) ? raw : "en";
  const family = familyForPath(pathname);
  const reel = useMemo(() => (family ? buildFamilyReel(family, locale) : null), [family, locale]);
  if (!family || !reel) return null;
  return <div className="opl-page opl-family-reel">
    <ReelSection id={`opl-reel-${family}`} eyebrow={reel.text.eyebrow} title={reel.text.title} lede={reel.text.lede} scenes={reel.scenes} kicks={reel.kicks} subs={reel.subs}
      labels={oplCopy[locale].reel} formatNumber={(n) => formatLocaleNumber(n, locale)} />
  </div>;
}
