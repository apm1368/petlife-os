import { HealthRecordDetailView } from "@/features/health-advanced/HealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; labResultId: string }> }) { const { id, labResultId } = await params; return <HealthRecordDetailView petId={id} recordId={labResultId} kind="lab" />; }
