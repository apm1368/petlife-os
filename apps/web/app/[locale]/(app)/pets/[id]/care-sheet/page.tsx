import { CareSheetView } from "@/features/care-sheet/CareSheetView";

export default async function CareSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CareSheetView petId={id} />;
}
