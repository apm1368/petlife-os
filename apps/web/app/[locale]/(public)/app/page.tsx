import { notFound } from "next/navigation";
import { isRouteLocale } from "@/lib/i18n/config";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { AppInstallView } from "@/features/pwa/AppInstallView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "appInstall");
}

/** /app — the Android app download, the iPhone/iPad web app and the desktop install, in every site language. */
export default async function AppInstallPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  return <AppInstallView locale={locale} />;
}
