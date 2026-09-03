import { HealthImagingView } from "@/features/health-advanced/HealthImagingView";

export default async function HealthImagingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthImagingView petId={id} />;
}
