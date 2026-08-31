export const locales = ["fa", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "fa";

export const localeDirection: Record<AppLocale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
};

export function isAppLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}
