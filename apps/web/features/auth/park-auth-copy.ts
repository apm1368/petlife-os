import type { RouteLocale } from "@/lib/i18n/config";
export const parkAuthCopy: Record<RouteLocale, { close: string; title: string; register: string; tagline: string; description: string; privacy: string }> = {
  fa: {
    close: "بستن و بازگشت به پارک", title: "ورود به دنیای اپت لایف", register: "ساخت حساب اپت لایف",
    tagline: "یک دنیا برای تو و همراهت", description: "سلامت، مراقبت و لحظه‌های مشترک؛ از همین‌جا شروع می‌شود.", privacy: "پروندهٔ همراهت، با اختیار خودت",
  },
  en: {
    close: "Close and return to the park", title: "Sign in to opetlife", register: "Create an opetlife account",
    tagline: "A world for you and your companion", description: "Health, care and shared moments. It starts here.", privacy: "Their record, your choice",
  },
  de: {
    close: "Schließen und zurück zum Park", title: "Bei opetlife anmelden", register: "Ein opetlife-Konto erstellen",
    tagline: "Eine Welt für dich und dein Tier", description: "Gesundheit, Pflege und gemeinsame Momente. Hier beginnt alles.", privacy: "Das Profil deines Tiers – deine Entscheidung",
  },
  es: {
    close: "Cerrar y volver al parque", title: "Inicia sesión en opetlife", register: "Crear una cuenta de opetlife",
    tagline: "Un mundo para ti y tu mascota", description: "Salud, cuidados y momentos compartidos. Todo empieza aquí.", privacy: "Su historial, tu decisión",
  },
};
