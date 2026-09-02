import { ProductResultsView } from "@/features/commerce/ProductResultsView";

export default async function ProductResultsPage({ searchParams }: { searchParams: Promise<{ category?: string; search?: string }> }) {
  const { category, search } = await searchParams;
  return <ProductResultsView category={category} search={search} />;
}
