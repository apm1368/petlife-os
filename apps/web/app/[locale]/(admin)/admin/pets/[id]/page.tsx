import { AdminPetDetailView } from "@/features/admin/pets/AdminPetsViews";

export default async function AdminPetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminPetDetailView petId={id} />;
}
