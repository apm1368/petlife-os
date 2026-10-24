import { HealthRecordDetailView } from "@/features/health-advanced/HealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; planId: string }> }) { const { id, planId } = await params; return <HealthRecordDetailView petId={id} recordId={planId} kind="rehab" />; }
