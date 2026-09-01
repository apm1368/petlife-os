import type { ServiceCategory } from "@petlife/types";
import { ServiceResultsView } from "@/features/services/ServiceResultsView";

export default async function ServiceResultsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <ServiceResultsView category={category as ServiceCategory} />;
}
