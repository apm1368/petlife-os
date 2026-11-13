import { BusinessShell } from "@/features/business/BusinessShell";

import type { Metadata } from "next";

/** Private, per-account area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <BusinessShell>{children}</BusinessShell>;
}
