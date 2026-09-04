import { InsuranceCompareView } from "@/features/insurance/InsuranceCompareView";

export default async function InsuranceComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const productIds = (ids ?? "").split(",").filter(Boolean);
  return <InsuranceCompareView productIds={productIds} />;
}
