"use client";

import { useTranslations } from "next-intl";
import { useSiteSettings } from "./site-settings";
import type { TrustSettings } from "./social-settings";

const ID = /^\d{3,12}$/;
const CODE = /^[A-Za-z0-9]{6,64}$/;

/** The trustseal URLs, built only from the admin's id and code (URL-encoded), or null when they are not valid. */
export function enamadUrls(id: unknown, code: unknown): { href: string; img: string } | null {
  if (typeof id !== "string" || typeof code !== "string" || !ID.test(id) || !CODE.test(code)) return null;
  const query = new URLSearchParams({ id, Code: code }).toString();
  return { href: `https://trustseal.enamad.ir/?${query}`, img: `https://trustseal.enamad.ir/logo.aspx?${query}` };
}

/**
 * eNamad trust seal in the footer (owner, 2026-11-13): eNamad's standard markup rendered from a fixed template with
 * only the id and code from the admin settings (trust.enamad*), never stored HTML; hidden until enabled with both.
 * The link keeps its referrer origin (referrerpolicy="origin"): eNamad verifies the seal by the site it is shown on.
 */
export function EnamadSeal() {
  const t = useTranslations("siteSettings");
  const settings = useSiteSettings() as TrustSettings | null;
  if (settings?.["trust.enamadEnabled"] !== true) return null;
  const code = settings["trust.enamadCode"];
  const urls = enamadUrls(settings["trust.enamadId"], code);
  if (!urls) return null;
  // eNamad's snippet carries the code on the image too.
  const extra = { code } as Record<string, string>;
  return (
    <a className="site-enamad" href={urls.href} target="_blank" rel="noopener" referrerPolicy="origin" aria-label={t("enamad")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- eNamad's own seal image, loaded from eNamad by design */}
      <img src={urls.img} alt={t("enamad")} referrerPolicy="origin" loading="lazy" decoding="async" {...extra} />
    </a>
  );
}
