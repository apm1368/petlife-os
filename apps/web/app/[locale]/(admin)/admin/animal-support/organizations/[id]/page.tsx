import { AdminOrganizationDetailView } from "@/features/admin/animal-support/AdminAnimalSupportViews";

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrganizationDetailView organizationId={id} />;
}
