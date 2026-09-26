import { HealthReferralsView } from "@/features/health-advanced/HealthReferralsView";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HealthReferralsView petId={id} />; }
