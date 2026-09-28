import { AdminShell } from "@/features/admin/AdminShell";

import type { Metadata } from "next";

/** Private, per-account area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
