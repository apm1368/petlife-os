import { HealthRecordDetailView } from "@/features/health-advanced/HealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; imagingStudyId: string }> }) { const { id, imagingStudyId } = await params; return <HealthRecordDetailView petId={id} recordId={imagingStudyId} kind="imaging" />; }
