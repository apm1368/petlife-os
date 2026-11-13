import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PartnerJoinView } from "@/features/partners/PartnerJoinView";
import { isRouteLocale } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/seo/site";

/** The page title in the reader's language (it was a fixed Persian string on every locale). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isRouteLocale(raw) ? raw : "fa";
  const t = await getTranslations({ locale, namespace: "partnerOnboarding" });
  return { title: `${t("intro.title")} | ${SITE_NAME[locale]}`, description: t("intro.body") };
}

export default function PartnerJoinPage() {
  return <PartnerJoinView />;
}
