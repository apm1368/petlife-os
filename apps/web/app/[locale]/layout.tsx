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
import { ThemeSync } from "@/features/theme/ThemeSync";
import { AuthModalOrigin } from "@/features/auth/AuthModalOrigin";
import { DesignRoot } from "@/features/design-system/DesignRoot";
import { PageMotion } from "@/features/motion/PageMotion";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "opetlife",
  applicationName: "opetlife",
  icons: {
    icon: [
      { url: "/brand/opetlife/04_app_icon_light.png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/opetlife/03_app_icon_dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/brand/opetlife/04_app_icon_light.png",
  },
  description: "Your pet's life, in one place.",
};

export default async function LocaleLayout({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
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
        {/* Which commit this bundle was built from — lets a reviewer confirm the preview is current. */}
        <meta name="petlife-build" content={process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeSync /><ToastProvider><PageMotion><AuthModalOrigin><LocalReviewTools><DesignRoot>{children}{modal}</DesignRoot></LocalReviewTools></AuthModalOrigin></PageMotion></ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
