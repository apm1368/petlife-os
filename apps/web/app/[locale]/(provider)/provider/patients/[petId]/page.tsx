import { VetPatientRecordView } from "@/features/vet-panel/VetPatientRecordView";

export default async function ProviderPatientPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  return <VetPatientRecordView petId={petId} />;
}
