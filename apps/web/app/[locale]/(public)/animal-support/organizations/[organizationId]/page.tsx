import { AnimalSupportOrganizationDetailView } from "@/features/animal-support/AnimalSupportOrganizationDetailView";

export default async function AnimalSupportOrganizationDetailPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <AnimalSupportOrganizationDetailView organizationId={organizationId} />;
}
