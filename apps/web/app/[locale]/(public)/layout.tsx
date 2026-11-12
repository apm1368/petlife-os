import { PublicShell } from "@/features/app-shell/PublicShell";
import type { Metadata } from "next";
import "@/features/landing/opl/opl-landing.css";
import "@/features/reel/reel.css";

// Public client views must receive HTML referencing the current build's chunks.
// Do not retain full-route HTML across deployments (observed /de/legal assets 404).
// The separate landing/HERO route is outside this route group.
export const dynamic = "force-dynamic";

/** Public pages are noindex unless a route explicitly opts in with reviewed metadata. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
