import { BookingWizard } from "@/features/vet/BookingWizard";

export default async function BookVetPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return <BookingWizard providerId={providerId} />;
}
