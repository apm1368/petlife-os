import { SharedRecordDetailView } from "@/features/vet-panel/SharedRecordsView";

export default async function ProviderSharedRecordPage({ params }: { params: Promise<{ petId: string; shareId: string }> }) {
  const { petId, shareId } = await params;
  return <SharedRecordDetailView petId={petId} shareId={shareId} />;
}
