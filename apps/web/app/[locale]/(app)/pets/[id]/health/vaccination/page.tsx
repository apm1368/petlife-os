import { VaccinationSummaryView } from "@/features/health/VaccinationSummaryView";

export default async function VaccinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VaccinationSummaryView petId={id} />;
}
