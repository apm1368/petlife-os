"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Avatar, Skeleton } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAppBootstrap();
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.status);
  const t = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (!isLoading && status === "unauthenticated") {
      router.replace(`/${locale}/welcome`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, status]);

  if (isLoading || status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="text-section-title text-text-primary">{t("appName")}</span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? <Avatar name={user.displayName} src={user.avatarUrl} size="sm" /> : null}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
