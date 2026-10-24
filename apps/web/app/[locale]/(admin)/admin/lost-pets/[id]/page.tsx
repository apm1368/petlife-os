import { AdminLostPetDetailView } from "@/features/admin/animal-support/AdminAnimalSupportViews";

export default async function AdminLostPetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminLostPetDetailView incidentId={id} />;
}
