import { VetPatientRecordView } from "@/features/vet-panel/VetPatientRecordView";

export default async function ProviderPatientPage({ params, searchParams }: { params: Promise<{ petId: string }>; searchParams: Promise<{ startVisitForBooking?: string }> }) {
  const { petId } = await params;
  const { startVisitForBooking } = await searchParams;
  return <VetPatientRecordView petId={petId} bookingId={startVisitForBooking} />;
}
