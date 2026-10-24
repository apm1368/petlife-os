import { BasicHealthRecordDetailView } from "@/features/health/BasicHealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; medicationId: string }> }) { const { id, medicationId } = await params; return <BasicHealthRecordDetailView petId={id} recordId={medicationId} kind="medication" />; }
