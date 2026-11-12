import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminOrdersView } from "@/features/admin-orders/AdminOrdersView";
import { sectionOfSlug } from "@/features/admin-orders/order-sections";

export default async function AdminOrdersSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const section = sectionOfSlug((await params).section);
  if (!section) notFound();
  return (
    <Suspense>
      <AdminOrdersView section={section} />
    </Suspense>
  );
}
