import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isRouteLocale } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/seo/site";
import { PlaceSuggestView } from "@/features/places/PlaceSuggestView";

/** A localized tab title; the member area stays noindex (its layout). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isRouteLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "places.suggest" });
  return { title: `${t("title")} | ${SITE_NAME[locale]}` };
}

/** /places/suggest — a member suggests a pet-friendly place; staff review it before it is listed. */
export default function PlaceSuggestPage() {
  return <PlaceSuggestView />;
}
