"use client";
import { MemberFrame } from "./MemberFrame";
import { LocalPreviewGate } from "@/features/local-preview/LocalPreviewGate";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { Brand } from "@/features/brand/Brand";
import { isRouteLocale } from "@/lib/i18n/config";
import "@/features/landing/opl/opl-landing.css";

function LiveAppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, error, retry } = useAppBootstrap();
  const status = useSessionStore((s) => s.status);
  const t = useTranslations("common");
  const router = useRouter();
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const pathname = usePathname();
  const routeLocale = isRouteLocale(locale) ? locale : "en";

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
      <div className="opl-page opl-boot">
        <main className="opl-boot__card">
          <Brand locale={routeLocale} />
          <ErrorRecovery title={tErrors("generic")} message="" retryLabel={t("retry")} onRetry={retry} />
        </main>
      </div>
    );
  }

  if (isLoading || status !== "authenticated") {
    return (
      <div className="opl-page opl-boot" role="status" aria-label={t("loading")}>
        <span className="opl-boot__mark"><Brand locale={routeLocale} /></span>
        <Skeleton className="h-2 w-28 rounded-full" />
      </div>
    );
  }

  return <MemberFrame>{children}</MemberFrame>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocalPreviewGate title="opetlife" live={<LiveAppShell>{children}</LiveAppShell>}>
      {children}
    </LocalPreviewGate>
  );
}
