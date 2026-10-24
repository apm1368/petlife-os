import { ProviderShell } from "@/features/provider/ProviderShell";

import type { Metadata } from "next";

/** Private, per-account area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return <ProviderShell>{children}</ProviderShell>;
}
