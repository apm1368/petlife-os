import { ProviderShell } from "@/features/provider/ProviderShell";

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return <ProviderShell>{children}</ProviderShell>;
}
