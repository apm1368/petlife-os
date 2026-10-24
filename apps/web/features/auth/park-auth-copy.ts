import type { AppLocale } from "@/lib/i18n/config";
export const parkAuthCopy: Record<AppLocale, { close: string; title: string; register: string; tagline: string; description: string; privacy: string }> = {
  fa: {
    close: "بستن و بازگشت به پارک", title: "ورود به دنیای opetlife", register: "ساخت حساب opetlife",
    tagline: "یک دنیا برای تو و همراهت", description: "سلامت، مراقبت و لحظه‌های مشترک؛ از همین‌جا شروع می‌شود.", privacy: "پروندهٔ همراهت، با اختیار خودت",
  },
  en: {
    close: "Close and return to the park", title: "Sign in to opetlife", register: "Create an opetlife account",
    tagline: "A world for you and your companion", description: "Health, care and shared moments. It starts here.", privacy: "Their record, your choice",
  },
};
