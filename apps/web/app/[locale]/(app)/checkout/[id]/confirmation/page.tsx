import { OrderConfirmationView } from "@/features/commerce/OrderConfirmationView";

export default async function OrderConfirmationPage({ searchParams }: { searchParams: Promise<{ orders?: string }> }) {
  const { orders } = await searchParams;
  const orderIds = orders ? orders.split(",").filter(Boolean) : [];
  return <OrderConfirmationView orderIds={orderIds} />;
}
