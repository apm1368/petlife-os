import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";

const MESSAGES = { en, fa } as const;

/** Renders with the app's real message catalogs, so tests exercise actual copy and RTL locale behavior, not stubs. */
export function renderWithIntl(ui: ReactElement, locale: "en" | "fa" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}
