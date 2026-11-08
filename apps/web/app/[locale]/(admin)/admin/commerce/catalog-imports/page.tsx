import { AdminCatalogImportsView } from "@/features/admin/commerce/AdminCatalogImportsView";
import { AdminCommerceNav } from "@/features/admin/commerce/AdminCommerceViews";

export default function CatalogImportsPage() {
  return (
    <>
      <AdminCommerceNav />
      <AdminCatalogImportsView />
    </>
  );
}
