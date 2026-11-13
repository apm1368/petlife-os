import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import ar from "@/messages/ar.json";
import nl from "@/messages/nl.json";
import type { RouteLocale } from "@/lib/i18n/config";
import { mergeMessages } from "@/lib/i18n/merge-messages";

/** Renders with the app's real message catalogs, so tests exercise actual copy and RTL locale behavior, not stubs. */
export function renderWithIntl(ui: ReactElement, locale: RouteLocale = "en") {
  // German, Spanish, Arabic and Dutch message trees override the English fallback, as in lib/i18n/request.ts.
  const localized = { de, es, ar, nl } as const;
  const messages = locale === "fa" ? fa : locale in localized ? mergeMessages(en, localized[locale as keyof typeof localized]) : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
