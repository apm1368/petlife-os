import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ToastProvider } from "@petlife/ui";
import { locales, localeDirection, isRouteLocale } from "@/lib/i18n/config";
import { themeInitScript } from "@/lib/theme/theme-script";
import { inter, vazirmatn } from "@/lib/fonts";
import "../globals.css";
import { LocalReviewTools } from "@/features/local-preview/LocalReviewTools";
import { ThemeSync } from "@/features/theme/ThemeSync";
import { DisplayModeSync } from "@/features/display-mode/DisplayModeSync";
import { AuthModalOrigin } from "@/features/auth/AuthModalOrigin";
import { DesignRoot } from "@/features/design-system/DesignRoot";
import { PageMotion } from "@/features/motion/PageMotion";
import { SITE_NAME, SITE_ORIGIN, SITE_TAGLINE } from "@/lib/seo/site";
import { MaintenanceGate } from "@/features/site-settings/MaintenanceGate";
import { PwaRuntime } from "@/features/pwa/PwaRuntime";
import { manifestPath, PWA_BACKGROUND_COLOR, PWA_DARK_BACKGROUND_COLOR } from "@/lib/pwa/manifest";

/** Phones: content may use the whole screen (the app shell pads for notches and the home indicator); the browser bar takes the page colour. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PWA_BACKGROUND_COLOR },
    { media: "(prefers-color-scheme: dark)", color: PWA_DARK_BACKGROUND_COLOR },
  ],
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Site-wide defaults in the page's own language; every public page that should rank sets its own title, description and canonical. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const routeLocale = isRouteLocale(locale) ? locale : "fa";
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: SITE_NAME[routeLocale],
    applicationName: "opetlife",
    manifest: manifestPath(routeLocale),
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        { url: "/brand/opl/favicon.svg", type: "image/svg+xml" },
      ],
      apple: "/brand/opl/app-icon-180.png",
    },
    description: SITE_TAGLINE[routeLocale],
    alternates: { types: { "application/rss+xml": `/${routeLocale}/feed.xml` } },
  };
}

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
  if (!isRouteLocale(locale)) notFound();

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
          <ThemeSync /><DisplayModeSync /><PwaRuntime /><ToastProvider><PageMotion><AuthModalOrigin><LocalReviewTools><DesignRoot><MaintenanceGate>{children}{modal}</MaintenanceGate></DesignRoot></LocalReviewTools></AuthModalOrigin></PageMotion></ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
