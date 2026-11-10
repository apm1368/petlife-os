import { PublicShell } from "@/features/app-shell/PublicShell";

// Public client views must receive HTML referencing the current build's chunks.
// Do not retain full-route HTML across deployments (observed /de/legal assets 404).
// The separate landing/HERO route is outside this route group.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
