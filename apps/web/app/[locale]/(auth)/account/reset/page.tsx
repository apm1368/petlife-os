"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@petlife/ui";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/lib/api/client";

function ResetPasswordFlow() {
  const t = useTranslations("auth"); const router = useRouter(); const locale = useLocale(); const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? ""; const [newPassword, setNewPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const [success, setSuccess] = useState(false);
  async function submit() { setError(null); setIsSubmitting(true); try { await authService.resetPassword(token, newPassword); setSuccess(true); } catch (err) { if (err instanceof ApiError && err.code === "PASSWORD_RESET_TOKEN_INVALID") setError(t("reset.invalidToken")); else setError(locale === "fa" ? "تغییر رمز انجام نشد. دوباره تلاش کنید." : "Could not reset password. Try again."); } finally { setIsSubmitting(false); } }
  if (success) return <div className="flex flex-col gap-5 text-center"><h1 className="text-page-title text-text-primary">{t("reset.title")}</h1><p className="text-body text-text-secondary">{t("reset.success")}</p><Button variant="primary" onClick={() => router.push(`/${locale}/account?method=password`)}>{t("password.login")}</Button></div>;
  if (!token) return <div className="flex flex-col gap-5 text-center"><p className="text-body text-state-urgent">{t("reset.invalidToken")}</p><Link href={`/${locale}/account/forgot`} className="text-center text-metadata text-text-secondary underline">{t("forgot.title")}</Link></div>;
  return <div className="flex flex-col gap-5"><h1 className="text-page-title text-text-primary">{t("reset.title")}</h1><PasswordInput label={t("reset.newPasswordLabel")} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} errorMessage={error ?? undefined} autoFocus /><PasswordInput label={locale === "fa" ? "تکرار رمز عبور" : "Confirm password"} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} errorMessage={confirmation && confirmation !== newPassword ? (locale === "fa" ? "رمزها یکسان نیستند." : "Passwords do not match.") : undefined} /><Button variant="primary" isLoading={isSubmitting} disabled={newPassword.length < 8 || newPassword !== confirmation} onClick={submit}>{t("reset.submit")}</Button></div>;
}
export default function ResetPasswordPage() { return <Suspense><ResetPasswordFlow /></Suspense>; }
