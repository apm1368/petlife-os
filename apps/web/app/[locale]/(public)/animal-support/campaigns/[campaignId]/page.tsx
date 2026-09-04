import { SupportCampaignDetailView } from "@/features/animal-support/SupportCampaignDetailView";

export default async function SupportCampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <SupportCampaignDetailView campaignId={campaignId} />;
}
