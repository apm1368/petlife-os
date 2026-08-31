import { ConditionsView } from "@/features/health/ConditionsView";

export default async function ConditionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConditionsView petId={id} />;
}
