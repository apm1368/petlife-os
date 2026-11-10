import { AdminCampaignDetail } from "@/features/admin/animal-support/AdminSupportOperations";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminCampaignDetail id={id} />;
}
