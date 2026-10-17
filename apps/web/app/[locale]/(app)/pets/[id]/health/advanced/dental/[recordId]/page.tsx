import { HealthRecordDetailView } from "@/features/health-advanced/HealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; recordId: string }> }) { const { id, recordId } = await params; return <HealthRecordDetailView petId={id} recordId={recordId} kind="dental" />; }
