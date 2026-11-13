import { PublicPetMemorialSection } from "@/features/landing/PublicPetMemorialSection";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "memorials");
}

/** Public memorials (#290 Q60): only owner-submitted, staff-approved memorials (the latest the API returns), at twilight. */
export default function MemorialsPage() {
  return <PublicPetMemorialSection page />;
}
