"use client";
import { MemberFrame } from "./MemberFrame";
import { LocalPreviewGate } from "@/features/local-preview/LocalPreviewGate";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";

function LiveAppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, error, retry } = useAppBootstrap();
  const status = useSessionStore((s) => s.status);
  const t = useTranslations("common");
  const router = useRouter();
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !error && status === "unauthenticated") {
      router.replace(
        `/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error, status, pathname]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <ErrorRecovery title={tErrors("generic")} message="" retryLabel={t("retry")} onRetry={retry} />
      </main>
    );
  }

  if (isLoading || status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={t("loading")} />
      </div>
    );
  }

  return <MemberFrame>{children}</MemberFrame>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocalPreviewGate title="PET LIFE" live={<LiveAppShell>{children}</LiveAppShell>}>
      {children}
    </LocalPreviewGate>
  );
}
