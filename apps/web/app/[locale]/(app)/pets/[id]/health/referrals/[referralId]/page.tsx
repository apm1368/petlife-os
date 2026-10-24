import { HealthRecordDetailView } from "@/features/health-advanced/HealthRecordDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; referralId: string }> }) { const { id, referralId } = await params; return <HealthRecordDetailView petId={id} recordId={referralId} kind="referral" />; }
