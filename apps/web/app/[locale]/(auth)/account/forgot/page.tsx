"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input, OtpInput } from "@petlife/ui";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { authErrorMessage } from "@/features/auth/auth-error";
import { authService } from "@/services/auth.service";

/** Password reset: a code texted to the account's verified mobile, entered with the new password. */
function ForgotPasswordFlow() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [stage, setStage] = useState<"username" | "reset" | "done">("username");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginUrl = returnTo ? `/${locale}/account?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account`;

  async function requestCode() {
    setIsSubmitting(true);
    setFailed(false);
    try {
      // Always resolves the same way regardless of whether the username matched an account.
      await authService.forgotPassword(username);
      setStage("reset");
    } catch {
      setFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function reset() {
    setIsSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword({ username, code, newPassword });
      setStage("done");
    } catch (err) {
      setCode("");
      setError(authErrorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-5 text-center">
        <h1 className="text-page-title text-text-primary">{t("reset.title")}</h1>
        <p className="text-body text-text-secondary">{t("reset.success")}</p>
        <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">{t("password.login")}</Link>
      </div>
    );
  }

  if (stage === "reset") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-page-title text-text-primary">{t("reset.title")}</h1>
          <p className="mt-1 text-body text-text-secondary">{t("forgot.sent")}</p>
        </div>
        <OtpInput value={code} onChange={setCode} errorMessage={error ?? undefined} disabled={isSubmitting} />
        <PasswordInput label={t("forgot.newPasswordLabel")} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <PasswordInput label={t("register.confirmPasswordLabel")} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} errorMessage={confirmation && confirmation !== newPassword ? t("register.passwordMismatch") : undefined} />
        <Button variant="primary" isLoading={isSubmitting} disabled={code.length !== 6 || newPassword.length < 8 || newPassword !== confirmation} onClick={reset}>
          {t("forgot.reset")}
        </Button>
        <Button variant="ghost" disabled={isSubmitting} onClick={() => { setStage("username"); setCode(""); setError(null); }}>{t("otp.back")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("forgot.title")}</h1>
      {failed && <p role="alert" className="text-state-urgent">{t("forgot.failed")}</p>}
      <Input label={t("forgot.identifierLabel")} autoComplete="username" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      <Button variant="primary" isLoading={isSubmitting} disabled={username.trim().length < 3} onClick={requestCode}>
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
