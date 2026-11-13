import { AdminSetPetDetailView } from "@/features/admin/set-pet/AdminSetPetViews";

export default async function AdminSetPetRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSetPetDetailView id={id} />;
}
