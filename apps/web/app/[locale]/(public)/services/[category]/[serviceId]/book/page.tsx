import { ServiceBookingWizard } from "@/features/services/ServiceBookingWizard";
import { RequireAuth } from "@/features/auth/RequireAuth";

export default async function ServiceBookingPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  return (
    <RequireAuth>
      <ServiceBookingWizard serviceId={serviceId} />
    </RequireAuth>
  );
}
