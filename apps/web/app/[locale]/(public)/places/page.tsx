import { PlacesListView } from "@/features/places/PlacesListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "places");
}

export default function PlacesListPage() {
  return <PlacesListView />;
}
