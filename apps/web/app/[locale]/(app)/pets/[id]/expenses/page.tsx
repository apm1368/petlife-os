import { PetExpensesView } from "@/features/expenses/PetExpensesView";

export default async function PetExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PetExpensesView petId={id} />;
}
