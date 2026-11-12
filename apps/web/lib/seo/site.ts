import type { RouteLocale } from "@/lib/i18n/config";

/** The one public origin. Every canonical, hreflang, sitemap and structured-data URL is absolute on it. */
export const SITE_ORIGIN = "https://opetlife.ir";

/** Square brand mark used as the publisher logo in structured data and as the fallback share image. */
export const SITE_LOGO_PATH = "/brand/opl/app-icon-512.png";
export const SITE_SHARE_IMAGE_PATH = "/brand/opl/social-card-1200x630.png";

export const SITE_NAME: Record<RouteLocale, string> = { fa: "اپت‌لایف", en: "opetlife", de: "opetlife", es: "opetlife" };

export const OG_LOCALE: Record<RouteLocale, string> = { fa: "fa_IR", en: "en_US", de: "de_DE", es: "es_ES" };

/** BCP 47 tags for `inLanguage` and feeds. */
export const LANGUAGE_TAG: Record<RouteLocale, string> = { fa: "fa-IR", en: "en", de: "de", es: "es" };

export const SITE_TAGLINE: Record<RouteLocale, string> = {
  fa: "خدمات، راهنما و ابزارهای نگهداری سگ و گربه در یک جا",
  en: "Care, guides and services for life with your dog or cat, in one place",
  de: "Pflege, Ratgeber und Services für das Leben mit Hund oder Katze an einem Ort",
  es: "Cuidados, guías y servicios para la vida con tu perro o gato en un solo lugar",
};

/**
 * The Persian landing is served at the bare domain (the owner's canonical entry); `/fa` permanently
 * redirects there, so the Persian home has exactly one URL. Every other page keeps its locale prefix.
 */
export function localeHomePath(locale: string): string {
  return locale === "fa" ? "/" : `/${locale}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

/** Organization + WebSite structured data: who runs the site and what it is called in each language. */
export function organizationJsonLd(locale: RouteLocale) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "opetlife",
      alternateName: ["اپت‌لایف", "اپت لایف", "Opetlife", "oPetLife"],
      url: `${SITE_ORIGIN}/`,
      logo: { "@type": "ImageObject", url: absoluteUrl(SITE_LOGO_PATH), width: 512, height: 512 },
      description: SITE_TAGLINE[locale],
      areaServed: "IR",
      knowsAbout: ["Dog care", "Cat care", "Pet training", "Pet health", "Pet nutrition", "Pet-friendly travel", "Lost and found pets"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: SITE_NAME[locale],
      alternateName: ["opetlife", "اپت‌لایف"],
      url: absoluteUrl(localeHomePath(locale)),
      inLanguage: LANGUAGE_TAG[locale],
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
  ];
}

/** Serialises structured data for a `<script type="application/ld+json">`, escaping `<` so content can never close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
