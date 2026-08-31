import { NutritionBasicsView } from "@/features/health/NutritionBasicsView";

export default async function NutritionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NutritionBasicsView petId={id} />;
}
