"use client";

import { Suspense, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

/**
 * Landing page for the real Google OAuth callback (a server-driven full
 * page redirect — see AuthGoogleController): the session cookie is already
 * set by the time this page loads, so this just mirrors what
 * account/page.tsx's verify() does after an OTP/password login — resolve
 * the session, decide onboarding vs. the original returnTo, and navigate.
 * OTP/password logins never hit this page; they resolve the destination
 * inline since they already have a JS context to redirect from.
 */
function AuthCompleteFlow() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("common");
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const setUser = useSessionStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const { user } = await authService.getSession();
        if (cancelled) return;
        setUser(user);
        const progress = await onboardingService.getProgress();
        if (cancelled) return;
        router.replace(resolvePostAuthDestination(locale, returnTo, progress));
      } catch {
        if (!cancelled) router.replace(`/${locale}/welcome`);
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Skeleton className="h-8 w-40" aria-label={t("loading")} />
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense>
      <AuthCompleteFlow />
    </Suspense>
  );
}
