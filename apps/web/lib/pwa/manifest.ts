import type { MetadataRoute } from "next";
import { localeDirection, type RouteLocale } from "@/lib/i18n/config";
import { SITE_TAGLINE } from "@/lib/seo/site";

/** Brand colours from the brand kit (/root/opetlife-brand-kit README): forest green and warm paper. */
export const PWA_THEME_COLOR = "#1F5A3D";
export const PWA_BACKGROUND_COLOR = "#FFFBF5";
/** Dark-theme paper (opl-landing.css), for the browser bar when the page is dark. */
export const PWA_DARK_BACKGROUND_COLOR = "#121512";

const APP_NAME: Record<RouteLocale, string> = { fa: "اپت لایف", en: "opetlife", de: "opetlife", es: "opetlife", ar: "opetlife", nl: "opetlife" };

const SHORTCUTS: Record<RouteLocale, { pets: string; calendar: string; shop: string; notifications: string }> = {
  fa: { pets: "حیوان‌های من", calendar: "تقویم مراقبت", shop: "فروشگاه", notifications: "اعلان‌ها" },
  en: { pets: "My pets", calendar: "Care calendar", shop: "Shop", notifications: "Notifications" },
  de: { pets: "Meine Tiere", calendar: "Pflegekalender", shop: "Shop", notifications: "Benachrichtigungen" },
  es: { pets: "Mis mascotas", calendar: "Calendario de cuidados", shop: "Tienda", notifications: "Notificaciones" },
  ar: { pets: "حيواناتي", calendar: "تقويم الرعاية", shop: "المتجر", notifications: "الإشعارات" },
  nl: { pets: "Mijn dieren", calendar: "Verzorgingskalender", shop: "Winkel", notifications: "Meldingen" },
};

export function manifestPath(locale: RouteLocale): string {
  return `/${locale}/manifest.webmanifest`;
}

/**
 * The installable app, one manifest per language: the installed app opens the member home in the language it was
 * installed from. Every language shares one `id`, so installing from /en and from / is the same app, not two.
 * The scope is the whole site, so links to any page stay inside the app window (and inside the Android app).
 */
export function buildManifest(locale: RouteLocale): MetadataRoute.Manifest {
  const name = APP_NAME[locale];
  const s = SHORTCUTS[locale];
  const icon = [{ src: "/brand/opl/app-icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/",
    name,
    short_name: name,
    description: SITE_TAGLINE[locale],
    lang: locale,
    dir: localeDirection[locale],
    start_url: `/${locale}/home`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["lifestyle", "health", "shopping"],
    icons: [
      { src: "/brand/opl/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/opl/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/opl/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/opl/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: s.pets, url: `/${locale}/pets`, icons: icon },
      { name: s.calendar, url: `/${locale}/care-calendar`, icons: icon },
      { name: s.shop, url: `/${locale}/shop`, icons: icon },
      { name: s.notifications, url: `/${locale}/notifications`, icons: icon },
    ],
  };
}
