import { notFound } from "next/navigation";
import { CustomerAffairsWorkspace } from "@/features/admin/customer-affairs/CustomerAffairsWorkspace";
import { isLocalPreviewRequest } from "@/lib/local-preview-server";

/** Design preview only: every figure is sample data (no backend), so real admins never reach it (decision 5). */
export default function AdminCustomerAffairsPage() {
  if (!isLocalPreviewRequest()) notFound();
  return <CustomerAffairsWorkspace />;
}
