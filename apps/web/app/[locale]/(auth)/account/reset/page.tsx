"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/lib/api/client";

function ResetPasswordFlow() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await authService.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PASSWORD_RESET_TOKEN_INVALID") {
        setError(t("reset.invalidToken"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <h1 className="text-page-title text-text-primary">{t("reset.title")}</h1>
        <p className="text-body text-text-secondary">{t("reset.success")}</p>
        <Button variant="primary" onClick={() => router.push(`/${locale}/account?method=password`)}>
          {t("password.login")}
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <p className="text-body text-state-urgent">{t("reset.invalidToken")}</p>
        <Link href={`/${locale}/account/forgot`} className="text-center text-metadata text-text-secondary underline">
          {t("forgot.title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("reset.title")}</h1>
      <Input label={t("reset.newPasswordLabel")} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} errorMessage={error ?? undefined} autoFocus />
      <Button variant="primary" isLoading={isSubmitting} disabled={newPassword.length < 8} onClick={submit}>
        {t("reset.submit")}
      </Button>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordFlow />
    </Suspense>
  );
}
