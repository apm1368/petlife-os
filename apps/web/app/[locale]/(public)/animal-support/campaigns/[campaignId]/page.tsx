import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { SupportCampaignDetailView } from "@/features/animal-support/SupportCampaignDetailView";

export default async function SupportCampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SupportCampaignDetailView campaignId={campaignId} />
    </Suspense>
  );
}
