import { AdminSupportNeedDetailView } from "@/features/admin/animal-support/AdminAnimalSupportViews";

export default async function AdminSupportNeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSupportNeedDetailView needId={id} />;
}
