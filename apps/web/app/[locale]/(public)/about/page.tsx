import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AboutView } from "@/features/about/AboutView";
import { isRouteLocale } from "@/lib/i18n/config";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { aboutPageJsonLd, jsonLdScript, organizationJsonLd } from "@/lib/seo/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "about");
}

/** About opetlife: the story, how the parts fit together and what we promise — a page of its own, not a landing section. */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "aboutPage" });
  const structured = [...organizationJsonLd(locale), aboutPageJsonLd(locale, t("title"), t("lede"))];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structured) }} />
      <AboutView />
    </>
  );
}
