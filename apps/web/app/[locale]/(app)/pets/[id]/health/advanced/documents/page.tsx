import { HealthDocumentsView } from "@/features/health-advanced/HealthDocumentsView";

export default async function HealthDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthDocumentsView petId={id} />;
}
