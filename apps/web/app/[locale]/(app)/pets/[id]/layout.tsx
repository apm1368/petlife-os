import { PetContextShell } from "@/features/pets/PetContextShell";

export default async function PetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PetContextShell petId={id}>{children}</PetContextShell>;
}
