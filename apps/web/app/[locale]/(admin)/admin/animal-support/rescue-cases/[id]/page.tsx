import { AdminRescueDetail } from "@/features/admin/animal-support/AdminSupportOperations";
export default function Page({ params }: { params: { id: string } }) { return <AdminRescueDetail id={params.id} />; }
