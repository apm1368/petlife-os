import { IncidentDetailView } from "@/features/help-center/PublicHelpViews";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IncidentDetailView id={id} />;
}
