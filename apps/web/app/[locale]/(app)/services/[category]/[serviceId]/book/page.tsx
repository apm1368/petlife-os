import { ServiceBookingWizard } from "@/features/services/ServiceBookingWizard";

export default async function ServiceBookingPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  return <ServiceBookingWizard serviceId={serviceId} />;
}
