import { ReportLostPetView } from "@/features/lost-pet/ReportLostPetView";

export default async function ReportLostPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportLostPetView petId={id} />;
}
