import { TicketDetailView } from "@/features/support/TicketDetailView";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetailView caseId={id} />;
}
