import { LegalDocumentView } from "@/features/help-center/PublicHelpViews";
import { notFound } from "next/navigation";

const LEGAL_SLUGS = new Set(["terms", "privacy", "cookies", "community-guidelines", "animal-welfare", "ai-and-safety", "payment-and-refund", "delivery", "installment-help", "accessibility"]);

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!LEGAL_SLUGS.has(slug)) notFound();
  return <LegalDocumentView slug={slug} />;
}
