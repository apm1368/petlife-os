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

type PushLocale = "fa" | "en" | "de" | "es";

/**
 * Lock-screen titles. A push carries only one of these and a link — never the notification's own title or body,
 * which can name a pet, a clinic, a medicine or an amount. Grouped by category so the member still knows roughly
 * what is waiting.
 */
const CATEGORY_TITLES: Record<string, Record<PushLocale, string>> = {
  HEALTH: { fa: "یادآور تازهٔ مراقبت", en: "New care reminder", de: "Neue Pflege-Erinnerung", es: "Nuevo recordatorio de cuidado" },
  BOOKING: { fa: "خبر تازه دربارهٔ نوبت شما", en: "Update on your booking", de: "Neuigkeit zu deinem Termin", es: "Novedad sobre tu cita" },
  SERVICE: { fa: "خبر تازه دربارهٔ خدمات", en: "Update on a service", de: "Neuigkeit zu einer Dienstleistung", es: "Novedad sobre un servicio" },
  PAYMENT: { fa: "خبر تازه دربارهٔ پرداخت", en: "Update on a payment", de: "Neuigkeit zu einer Zahlung", es: "Novedad sobre un pago" },
  COMMERCE: { fa: "خبر تازه دربارهٔ سفارش شما", en: "Update on your order", de: "Neuigkeit zu deiner Bestellung", es: "Novedad sobre tu pedido" },
  DELIVERY: { fa: "خبر تازه دربارهٔ ارسال", en: "Update on a delivery", de: "Neuigkeit zur Lieferung", es: "Novedad sobre un envío" },
  SELLER: { fa: "خبر تازه برای فروشگاه شما", en: "Update for your store", de: "Neuigkeit für deinen Shop", es: "Novedad para tu tienda" },
  MARKETPLACE: { fa: "خبر تازه از فروشگاه", en: "Update from the shop", de: "Neuigkeit aus dem Shop", es: "Novedad de la tienda" },
  HOUSEHOLD: { fa: "خبر تازه از خانوادهٔ شما", en: "Update from your household", de: "Neuigkeit aus deinem Haushalt", es: "Novedad de tu hogar" },
  PET_ACCESS: { fa: "خبر تازه دربارهٔ دسترسی به پرونده", en: "Update on pet record access", de: "Neuigkeit zum Zugriff auf eine Tierakte", es: "Novedad sobre el acceso a un historial" },
  SECURITY: { fa: "هشدار امنیتی حساب", en: "Account security alert", de: "Sicherheitshinweis zu deinem Konto", es: "Aviso de seguridad de tu cuenta" },
  SUPPORT: { fa: "پاسخ تازه از پشتیبانی", en: "New reply from support", de: "Neue Antwort vom Support", es: "Nueva respuesta de soporte" },
  SUBSCRIPTION: { fa: "خبر تازه دربارهٔ اشتراک", en: "Update on your membership", de: "Neuigkeit zu deiner Mitgliedschaft", es: "Novedad sobre tu membresía" },
  LOST_PET: { fa: "هشدار حیوان گم‌شده", en: "Lost pet alert", de: "Vermisst-Meldung", es: "Aviso de mascota perdida" },
  ANIMAL_SUPPORT: { fa: "خبر تازه از حمایت از حیوانات", en: "Update from animal support", de: "Neuigkeit aus dem Tierschutz", es: "Novedad de apoyo animal" },
  COMMUNITY: { fa: "پیام تازه در جامعه", en: "New in the community", de: "Neu in der Gemeinschaft", es: "Novedad en la comunidad" },
  TRAVEL: { fa: "خبر تازه دربارهٔ سفر", en: "Update on your trip", de: "Neuigkeit zu deiner Reise", es: "Novedad sobre tu viaje" },
  INSURANCE: { fa: "خبر تازه دربارهٔ بیمه", en: "Update on insurance", de: "Neuigkeit zur Versicherung", es: "Novedad sobre el seguro" },
  MARKETING: { fa: "پیشنهاد تازه از اپت لایف", en: "Something new from opetlife", de: "Neues von opetlife", es: "Novedades de opetlife" },
};

const GENERIC_TITLE: Record<PushLocale, string> = {
  fa: "اعلان تازه در اپت لایف",
  en: "New notification on opetlife",
  de: "Neue Benachrichtigung bei opetlife",
  es: "Nueva notificación en opetlife",
};

const TEST_TITLE: Record<PushLocale, string> = {
  fa: "اعلان‌های اپت لایف روی این دستگاه روشن است",
  en: "opetlife notifications are on for this device",
  de: "opetlife-Benachrichtigungen sind auf diesem Gerät aktiv",
  es: "Las notificaciones de opetlife están activadas en este dispositivo",
};

function pushLocale(locale: string): PushLocale {
  return locale === "fa" || locale === "de" || locale === "es" ? locale : "en";
}

/** The only text a push carries: a category-level title in the member's language. */
export function pushTitle(category: string | null | undefined, locale: string): string {
  const lang = pushLocale(locale);
  return (category ? CATEGORY_TITLES[category]?.[lang] : undefined) ?? GENERIC_TITLE[lang];
}

/** Title for the "send a test notification" button. */
export function pushTestTitle(locale: string): string {
  return TEST_TITLE[pushLocale(locale)];
}
