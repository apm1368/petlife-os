import { LegacyServiceBookingRedirect } from "@/features/booking-flow/LegacyServiceBookingRedirect";

/** Older links pointed at the per-service wizard; the canonical flow lives under the provider. */
export default async function ServiceBookingPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  return <LegacyServiceBookingRedirect serviceId={serviceId} />;
}
