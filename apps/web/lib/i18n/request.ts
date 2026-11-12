import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isRouteLocale } from "./config";
import { mergeMessages } from "./merge-messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isRouteLocale(requested) ? requested : defaultLocale;

  // German, Spanish, Arabic and Dutch apply their catalogs over the complete English one, so a key not yet
  // translated shows English rather than a missing-key error.
  const messagesLocale = locale === "fa" ? "fa" : "en";
  const fallback = (await import(`../../messages/${messagesLocale}.json`)).default;
  const localized = locale === "de" || locale === "es" || locale === "ar" || locale === "nl"
    ? (await import(`../../messages/${locale}.json`)).default
    : {};
  return {
    locale,
    messages: mergeMessages(fallback, localized),
  };
});
