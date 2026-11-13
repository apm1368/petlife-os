import { SupportNeedsListView } from "@/features/animal-support/SupportNeedsListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "animalSupportNeeds");
}


export default function SupportNeedsPage() {
  return <SupportNeedsListView />;
}
