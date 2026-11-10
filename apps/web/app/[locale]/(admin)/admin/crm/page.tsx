import { notFound } from "next/navigation";
import { CrmWorkspace } from "@/features/admin/crm/CrmWorkspace";
import { isLocalPreviewRequest } from "@/lib/local-preview-server";

/** Design preview only: every figure is sample data (no CRM backend), so real admins never reach it (decision 5). */
export default async function AdminCrmPage() {
  if (!(await isLocalPreviewRequest())) notFound();
  return <CrmWorkspace />;
}
