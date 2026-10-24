import { HealthDocumentDetailView } from "@/features/health-advanced/HealthDocumentDetailView";
export default async function Page({ params }: { params: Promise<{ id: string; documentId: string }> }) { const { id, documentId } = await params; return <HealthDocumentDetailView petId={id} documentId={documentId} />; }
