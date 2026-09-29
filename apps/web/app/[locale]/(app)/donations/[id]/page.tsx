import { DonationReceiptView } from "@/features/animal-support/DonationReceiptView";

export default async function DonationReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DonationReceiptView donationIntentId={id} />;
}
