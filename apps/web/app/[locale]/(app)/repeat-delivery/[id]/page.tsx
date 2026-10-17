import { RepeatDeliveryDetailView } from "@/features/commerce/RepeatDeliveryViews";

export default async function RepeatDeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RepeatDeliveryDetailView id={id} />;
}
