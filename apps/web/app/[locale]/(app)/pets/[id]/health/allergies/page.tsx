import { AllergiesView } from "@/features/health/AllergiesView";

export default async function AllergiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AllergiesView petId={id} />;
}
