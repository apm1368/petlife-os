import { notFound } from "next/navigation";
import { BuiltinFaqView } from "@/features/legal/LegalViews";
import { isRouteLocale } from "@/lib/i18n/config";
import { builtinFaq, faqPageJsonLd } from "@/lib/legal/builtin";
import { fetchPublishedFaqArticles } from "@/lib/legal/published";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { absoluteUrl, jsonLdScript } from "@/lib/seo/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "faq");
}

/** Frequently asked questions in every language, with FAQPage structured data; help-center FAQ articles follow. */
export default async function HelpFaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();
  const faq = builtinFaq(locale);
  const more = await fetchPublishedFaqArticles(locale);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqPageJsonLd(faq, absoluteUrl(`/${locale}/help/faq`))) }} />
      <BuiltinFaqView faq={faq} locale={locale} more={more} />
    </>
  );
}
