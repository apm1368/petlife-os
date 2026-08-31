"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@petlife/ui";

export default function WelcomePage() {
  const t = useTranslations("auth.welcome");
  const router = useRouter();
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        <h1 className="text-hero text-text-primary">{t("title")}</h1>
        <p className="mt-2 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button variant="primary" onClick={() => router.push(`/${locale}/account?method=email`)}>
          {t("continueWithEmail")}
        </Button>
        <Button variant="secondary" onClick={() => router.push(`/${locale}/account?method=phone`)}>
          {t("continueWithPhone")}
        </Button>
      </div>
    </div>
  );
}
