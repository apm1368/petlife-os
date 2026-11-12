import { publicOrigin } from "../../../common/email/email-layout";

const RTL_LOCALES = new Set(["fa", "ar"]);

export function pushDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * The page a tapped notification opens: the notification's own deep link in the member's language, or the
 * notification centre. Only same-origin links are allowed; the service worker re-checks this before opening.
 */
export function pushTargetUrl(webAppOrigin: string | undefined, locale: string, deepLink: string | null | undefined): string {
  const origin = publicOrigin(webAppOrigin);
  const fallback = `${origin}/${locale}/notifications`;
  if (!deepLink) return fallback;
  if (/^https?:\/\//i.test(deepLink)) {
    try {
      return new URL(deepLink).origin === new URL(origin).origin ? deepLink : fallback;
    } catch {
      return fallback;
    }
  }
  if (!deepLink.startsWith("/") || deepLink.startsWith("//")) return fallback;
  return `${origin}/${locale}${deepLink}`;
}

/** Copy for the "send a test notification" button, in every UI language (notification templates are fa/en only). */
export const PUSH_TEST_COPY: Record<string, { title: string; body: string }> = {
  fa: { title: "اعلان‌های اپت لایف روشن است", body: "یادآورهای مراقبت، نوبت‌ها، سفارش‌ها و هشدارهای حیوان گمشده روی همین دستگاه می‌رسد." },
  en: { title: "opetlife notifications are on", body: "Care reminders, bookings, orders and lost-pet alerts will reach this device." },
  de: { title: "opetlife-Benachrichtigungen sind aktiv", body: "Pflege-Erinnerungen, Termine, Bestellungen und Vermisst-Meldungen erreichen dieses Gerät." },
  es: { title: "Las notificaciones de opetlife están activadas", body: "Los recordatorios de cuidado, citas, pedidos y alertas de mascotas perdidas llegarán a este dispositivo." },
};
