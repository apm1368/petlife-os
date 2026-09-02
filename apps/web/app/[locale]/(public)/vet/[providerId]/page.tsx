import { VetProfileView } from "@/features/vet/VetProfileView";

export default async function VetProfilePage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return <VetProfileView providerId={providerId} />;
}
