import { ProviderProfileView } from "@/features/discovery/ProviderProfileView";

export default async function ProviderProfilePage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return <ProviderProfileView providerId={providerId} />;
}
