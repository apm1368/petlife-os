import { notFound } from "next/navigation";
import { SetPetOrdersPage } from "@/features/set-pet/SetPetOrdersPage";

/** /orders/set-pet/:id — notification links land here, on the member's own order (the list scrolls to it). */
export default async function SetPetOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <SetPetOrdersPage focusId={id} />;
}
