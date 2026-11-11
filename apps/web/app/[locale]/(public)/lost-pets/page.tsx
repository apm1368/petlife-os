import { PublicLostPetListView } from "@/features/lost-pet/PublicLostPetListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "lostPets");
}

export default function PublicLostPetListPage() {
  return <PublicLostPetListView />;
}
