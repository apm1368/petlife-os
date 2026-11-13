import { PartnerSupportDetailView } from "@/features/partner-support/PartnerSupportViews";

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <PartnerSupportDetailView panel="provider" caseId={caseId} />;
}
