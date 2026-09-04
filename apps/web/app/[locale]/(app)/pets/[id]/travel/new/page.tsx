import { NewTripView } from "@/features/travel/NewTripView";

export default async function NewTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewTripView petId={id} />;
}
