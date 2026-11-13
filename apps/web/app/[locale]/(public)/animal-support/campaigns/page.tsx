import { SupportCampaignListView } from "@/features/animal-support/SupportCampaignListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "animalSupportCampaigns");
}


export default function SupportCampaignListPage() {
  return <SupportCampaignListView />;
}
