import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isRouteLocale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isRouteLocale(requested) ? requested : defaultLocale;

  // German and Spanish are being rolled out by page family. Until a page's
  // messages are translated, use the English catalog rather than rendering
  // missing-key errors. Inline fa/en-only copy on unfinished pages is still
  // an acknowledged coverage gap, not a claim of full translation.
  const messagesLocale = locale === "de" || locale === "es" ? "en" : locale;
  return {
    locale,
    messages: (await import(`../../messages/${messagesLocale}.json`)).default,
  };
});
