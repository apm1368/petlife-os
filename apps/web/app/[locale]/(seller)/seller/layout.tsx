import { SellerShell } from "@/features/seller/SellerShell";

import type { Metadata } from "next";

/** Private, per-account area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
