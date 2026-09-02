import { Suspense } from "react";
import { Customer360View } from "@/features/admin/Customer360View";

export default async function AdminCustomer360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <Customer360View userId={id} />
    </Suspense>
  );
}
