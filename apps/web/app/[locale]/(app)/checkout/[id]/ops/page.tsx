import { CheckoutOpsView } from "@/features/commerce/CheckoutOpsView";

export default async function CheckoutOpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckoutOpsView checkoutId={id} />;
}
