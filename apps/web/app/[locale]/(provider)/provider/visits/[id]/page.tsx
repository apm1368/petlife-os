import { ProviderClinicalVisitView } from "@/features/provider/ProviderClinicalVisitView";

export default async function ProviderVisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ petId?: string }> }) {
  const { id } = await params;
  const { petId } = await searchParams;
  if (!petId) return null;
  return <ProviderClinicalVisitView petId={petId} visitId={id} />;
}
