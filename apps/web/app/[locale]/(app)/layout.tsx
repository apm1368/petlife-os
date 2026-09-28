import { AppShell } from "@/features/app-shell/AppShell";

import type { Metadata } from "next";

/** Private, per-account area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
