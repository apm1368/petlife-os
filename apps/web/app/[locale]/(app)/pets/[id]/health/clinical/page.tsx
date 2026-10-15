import { HealthRecordsView } from "@/features/health-advanced/HealthRecordsView";
export default async function ClinicalRecordsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HealthRecordsView key={id} petId={id} />; }
