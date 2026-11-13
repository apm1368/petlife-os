"use client";

import { useTranslations } from "next-intl";
import { useSiteSettings } from "./site-settings";
import { enamadSeal } from "./public-links";

/**
 * eNamad trust seal in the footer (owner, 2026-11-13): eNamad's standard markup rendered from a fixed template with
 * only the id and code from the admin settings (trust.enamad*), never stored HTML; hidden until enabled with both.
 * The link keeps its referrer origin (referrerpolicy="origin"): eNamad verifies the seal by the site it is shown on.
 */
export function EnamadSeal() {
  const t = useTranslations("siteSettings");
  const settings = useSiteSettings();
  // X3's builder: the standard trustseal link and image from the id and code only, or null (off / missing / invalid).
  const seal = enamadSeal(settings);
  if (!seal || !settings) return null;
  // eNamad's snippet carries the code on the image too.
  const extra = { code: settings["trust.enamadCode"] ?? "" } as Record<string, string>;
  return (
    <a className="site-enamad" href={seal.href} target="_blank" rel="noopener" referrerPolicy="origin" aria-label={t("enamad")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- eNamad's own seal image, loaded from eNamad by design */}
      <img src={seal.imageSrc} alt={t("enamad")} referrerPolicy="origin" loading="lazy" decoding="async" {...extra} />
    </a>
  );
}
