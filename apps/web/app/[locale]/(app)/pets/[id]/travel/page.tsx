import { TravelHubView } from "@/features/travel/TravelHubView";

export default async function TravelHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TravelHubView petId={id} />;
}
