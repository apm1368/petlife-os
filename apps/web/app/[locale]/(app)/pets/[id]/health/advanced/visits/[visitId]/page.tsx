import { ClinicalVisitDetailView } from "@/features/health-advanced/ClinicalVisitDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; visitId: string }> }) { const { id, visitId } = await params; return <ClinicalVisitDetailView petId={id} visitId={visitId} />; }
