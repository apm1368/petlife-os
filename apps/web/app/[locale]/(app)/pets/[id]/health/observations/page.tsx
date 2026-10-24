import { HealthObservationsView } from "@/features/health-advanced/HealthObservationsView";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HealthObservationsView petId={id} />; }
