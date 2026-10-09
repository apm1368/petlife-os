import { BasicHealthRecordDetailView } from "@/features/health/BasicHealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; allergyId: string }> }) { const { id, allergyId } = await params; return <BasicHealthRecordDetailView petId={id} recordId={allergyId} kind="allergy" />; }
