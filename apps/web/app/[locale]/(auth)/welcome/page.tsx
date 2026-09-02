"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@petlife/ui";
import { authService, type AuthMethodsDto } from "@/services/auth.service";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

function WelcomeFlow() {
  const t = useTranslations("auth.welcome");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "");
  const showGoogleError = searchParams.get("error") === "google_auth_failed";
  const [methods, setMethods] = useState<AuthMethodsDto | null>(null);

  useEffect(() => {
    void authService.getMethods().then(setMethods);
  }, []);

  function accountUrl(method: "email" | "phone" | "password") {
    const params = new URLSearchParams({ method });
    if (returnTo) params.set("returnTo", returnTo);
    return `/${locale}/account?${params.toString()}`;
  }

  function registerUrl() {
    return returnTo ? `/${locale}/register?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/register`;
  }

  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        <h1 className="text-hero text-text-primary">{t("title")}</h1>
        <p className="mt-2 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      {showGoogleError ? <p className="text-metadata text-state-urgent">{t("googleAuthFailed")}</p> : null}
      <div className="flex flex-col gap-3">
        {methods?.google ? (
          <Button variant="secondary" onClick={() => (window.location.href = authService.googleLoginUrl(returnTo || `/${locale}/home`))}>
            {t("continueWithGoogle")}
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => router.push(accountUrl("email"))}>
          {t("continueWithEmail")}
        </Button>
        <Button variant="secondary" onClick={() => router.push(accountUrl("phone"))}>
          {t("continueWithPhone")}
        </Button>
        <Button variant="secondary" onClick={() => router.push(accountUrl("password"))}>
          {t("continueWithUsername")}
        </Button>
        <Button variant="ghost" onClick={() => router.push(registerUrl())}>
          {t("createAccount")}
        </Button>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeFlow />
    </Suspense>
  );
}
