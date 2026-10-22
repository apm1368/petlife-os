"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

/** Old emailed reset links land here; resets now go through a code texted to the account's mobile. */
export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-5 text-center">
      <h1 className="text-page-title text-text-primary">{t("reset.title")}</h1>
      <p className="text-body text-text-secondary">{t("reset.moved")}</p>
      <Link href={`/${locale}/account/forgot`} className="text-center text-metadata text-text-secondary underline">{t("forgot.title")}</Link>
    </div>
  );
}
