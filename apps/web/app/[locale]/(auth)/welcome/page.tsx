"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@petlife/ui";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

/** Entry to the only sign-in method: username + password, confirmed with an SMS code. */
function WelcomeFlow() {
  const t = useTranslations("auth.welcome");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "");
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        <h1 className="text-hero text-text-primary">{t("title")}</h1>
        <p className="mt-2 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button variant="primary" onClick={() => router.push(`/${locale}/account${query}`)}>{t("signIn")}</Button>
        <Button variant="secondary" onClick={() => router.push(`/${locale}/register${query}`)}>{t("createAccount")}</Button>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return <Suspense><WelcomeFlow /></Suspense>;
}
