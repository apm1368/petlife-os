import { TravelHomeView } from "@/features/travel-market/TravelHomeView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return publicPageMetadata(locale, "travel");
}

export default function TravelHomePage() {
  return <TravelHomeView />;
}
