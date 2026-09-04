import { HealthNutritionView } from "@/features/health-advanced/HealthNutritionView";

export default async function HealthNutritionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthNutritionView petId={id} />;
}
