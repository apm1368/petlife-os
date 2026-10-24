import { ClinicalVisitsView } from "@/features/health-advanced/ClinicalVisitsView";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ClinicalVisitsView petId={id} />; }
