import type { AppLocale } from "@/lib/i18n/config";

/** Existing routes own authentication and active-pet context; demo Cookie is never a real pet ID. */
export function landingDestination(locale: AppLocale, action: string): string {
  switch (action) {
    case "shop":
      return `/${locale}/shop`;
    case "vet":
      return `/${locale}/vet/find`;
    case "care":
    case "groom":
    case "taxi":
      return `/${locale}/services`;
    case "cookie":
    case "health":
      return `/${locale}/pets`;
    default:
      return `/${locale}/welcome`;
  }
}
