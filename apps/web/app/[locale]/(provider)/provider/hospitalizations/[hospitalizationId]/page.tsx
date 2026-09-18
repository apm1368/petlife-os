import { VetTreatmentSheetView } from "@/features/vet-panel/VetTreatmentSheetView";

/**
 * `petId` travels as a query parameter rather than a second path segment, the
 * same convention `/provider/visits/[id]?petId=` already uses: PetAccessGuard
 * needs the pet to authorize against, and the hospitalization id alone does
 * not name one in the URL.
 */
export default async function ProviderHospitalizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ hospitalizationId: string }>;
  searchParams: Promise<{ petId?: string }>;
}) {
  const { hospitalizationId } = await params;
  const { petId } = await searchParams;
  if (!petId) return null;
  return <VetTreatmentSheetView hospitalizationId={hospitalizationId} petId={petId} />;
}
