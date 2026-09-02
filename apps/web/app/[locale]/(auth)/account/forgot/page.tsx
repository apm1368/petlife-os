"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@petlife/ui";
import { authService } from "@/services/auth.service";

function ForgotPasswordFlow() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const loginUrl = returnTo ? `/${locale}/account?method=password&returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account?method=password`;

  async function submit() {
    setIsSubmitting(true);
    try {
      // Always resolves the same way regardless of whether identifier matched an account.
      await authService.forgotPassword(identifier);
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <h1 className="text-page-title text-text-primary">{t("forgot.title")}</h1>
        <p className="text-body text-text-secondary">{t("forgot.sent")}</p>
        <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">
          {t("forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("forgot.title")}</h1>
      <Input label={t("forgot.identifierLabel")} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
      <Button variant="primary" isLoading={isSubmitting} disabled={!identifier} onClick={submit}>
        {t("forgot.submit")}
      </Button>
      <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">
        {t("forgot.backToLogin")}
      </Link>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordFlow />
    </Suspense>
  );
}
