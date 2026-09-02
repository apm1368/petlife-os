"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { Skeleton } from "@petlife/ui";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { buildLoginUrl } from "@/lib/auth/return-to";

/**
 * "Auth-on-action": wraps a single gated action (booking creation, etc.)
 * that lives on an otherwise-public page tree, rather than gating the whole
 * route. An anonymous visitor who reaches this component is redirected to
 * /welcome with the current path as returnTo, and lands back here — already
 * authenticated — the moment sign-in completes, instead of being bounced to
 * Home.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  useSessionBootstrap();
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(buildLoginUrl(locale, pathname));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-8 w-40" aria-label="Loading" />
      </div>
    );
  }

  return <>{children}</>;
}
