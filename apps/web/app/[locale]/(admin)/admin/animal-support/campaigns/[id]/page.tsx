import { AdminCampaignDetail } from "@/features/admin/animal-support/AdminSupportOperations";
export default function Page({ params }: { params: { id: string } }) { return <AdminCampaignDetail id={params.id} />; }
