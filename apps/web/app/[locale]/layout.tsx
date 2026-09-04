import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ToastProvider } from "@petlife/ui";
import { locales, localeDirection, isAppLocale } from "@/lib/i18n/config";
import { themeInitScript } from "@/lib/theme/theme-script";
import { inter, vazirmatn } from "@/lib/fonts";
import "../globals.css";
import { LocalReviewTools } from "@/features/local-preview/LocalReviewTools";
import { PageMotion } from "@/features/motion/PageMotion";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "PET LIFE OS",
  description: "Your pet's life, in one place.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={localeDirection[locale]} className={`${vazirmatn.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider><PageMotion><LocalReviewTools>{children}</LocalReviewTools></PageMotion></ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
