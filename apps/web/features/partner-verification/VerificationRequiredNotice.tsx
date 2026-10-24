"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";

export function VerificationRequiredNotice({ seller = false }: { seller?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("partnerVerification");
  return (
    <ContextSurface>
      <p role="status">{t("activationRequired")}</p>
      <Link className="mt-3 inline-block underline" href={`/${locale}/${seller ? "seller" : "provider"}/verification`}>
        {t("portalTitle")}
      </Link>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>{t("refreshAccess")}</Button>
      </div>
    </ContextSurface>
  );
}
