import { ProviderClinicalPatientView } from "@/features/provider/ProviderClinicalPatientView";

export default async function ProviderPatientPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  return <ProviderClinicalPatientView petId={petId} />;
}
