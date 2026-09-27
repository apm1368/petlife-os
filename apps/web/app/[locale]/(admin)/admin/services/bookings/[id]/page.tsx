import { AdminServiceBookingDetailView } from "@/features/admin/services/AdminServicesViews";

export default async function AdminServiceBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminServiceBookingDetailView bookingId={id} />;
}
