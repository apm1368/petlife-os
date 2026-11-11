import { AnimalSupportOrganizationListView } from "@/features/animal-support/AnimalSupportOrganizationListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "animalSupport");
}

export default function AnimalSupportOrganizationListPage() {
  return <AnimalSupportOrganizationListView />;
}
