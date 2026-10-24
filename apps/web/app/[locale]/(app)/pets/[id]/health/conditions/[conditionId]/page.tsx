import { BasicHealthRecordDetailView } from "@/features/health/BasicHealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; conditionId: string }> }) { const { id, conditionId } = await params; return <BasicHealthRecordDetailView petId={id} recordId={conditionId} kind="condition" />; }
