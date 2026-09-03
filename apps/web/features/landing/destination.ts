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
      return `/${locale}/pets`;
    case "health":
      return `/${locale}/pets/active?view=health`;
    default:
      return `/${locale}/welcome`;
  }
}
