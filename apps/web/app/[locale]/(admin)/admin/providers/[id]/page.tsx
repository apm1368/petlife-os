import { Partner360View } from "@/features/admin/Partner360View";

export default async function AdminProvider360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Partner360View kind="providers" partnerId={id} />;
}
