import { BookingWizard } from "@/features/vet/BookingWizard";
import { RequireAuth } from "@/features/auth/RequireAuth";

export default async function BookVetPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return (
    <RequireAuth>
      <BookingWizard providerId={providerId} />
    </RequireAuth>
  );
}
