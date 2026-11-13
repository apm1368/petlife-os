import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/features/help-center/PublicHelpViews";
import { BuiltinLegalView } from "@/features/legal/LegalViews";
import { isRouteLocale } from "@/lib/i18n/config";
import { builtinLegalDocument, isBuiltinLegalSlug } from "@/lib/legal/builtin";
import { hasPublishedLegalDocument } from "@/lib/legal/published";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

const LEGAL_SLUGS = new Set(["terms", "privacy", "cookies", "community-guidelines", "animal-welfare", "ai-and-safety", "payment-and-refund", "delivery", "installment-help", "accessibility"]);
const METADATA = { terms: "legalTerms", privacy: "legalPrivacy" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  return isBuiltinLegalSlug(slug) ? publicPageMetadata(locale, METADATA[slug]) : {};
}

/**
 * Terms and Privacy render the built-in text (all six languages, server-side) unless the owner has published a
 * reviewed version for this language in the admin; the other legal documents come from the admin only.
 */
export default async function LegalPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!LEGAL_SLUGS.has(slug)) notFound();
  if (isBuiltinLegalSlug(slug) && isRouteLocale(locale) && !(await hasPublishedLegalDocument(slug, locale))) {
    return <BuiltinLegalView slug={slug} doc={builtinLegalDocument(slug, locale)} locale={locale} />;
  }
  return <LegalDocumentView slug={slug} />;
}
