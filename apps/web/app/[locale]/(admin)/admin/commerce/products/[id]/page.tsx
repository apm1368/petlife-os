import { AdminProductDetailView } from "@/features/admin/commerce/AdminProductDetailView";

export default async function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProductDetailView productId={id} />;
}
