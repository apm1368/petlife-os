import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import type { RouteLocale } from "@/lib/i18n/config";

/** Renders with the app's real message catalogs, so tests exercise actual copy and RTL locale behavior, not stubs. */
export function renderWithIntl(ui: ReactElement, locale: RouteLocale = "en") {
  // DE/ES route infrastructure is live before those message catalogs are complete; use the documented EN fallback.
  const messages = locale === "fa" ? fa : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
