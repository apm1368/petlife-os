"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { normalizeIranPhone } from "@petlife/validation";
import { Button, Input, OtpInput } from "@petlife/ui";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { authErrorMessage } from "@/features/auth/auth-error";
import { authService } from "@/services/auth.service";
import { accountService } from "@/services/account.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

const DEFAULT_RESEND_SECONDS = 30;

/** Sign-up: username, password and mobile; the account is created only with the code texted to that mobile. */
function RegisterFlow() {
  const t = useTranslations("auth"); const router = useRouter(); const locale = useLocale(); const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo"); const setUser = useSessionStore((s) => s.setUser);
  const [stage, setStage] = useState<"details" | "otp">("details");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState(""); const [phone, setPhone] = useState(""); const [accepted, setAccepted] = useState(false);
  const [normalizedPhone, setNormalizedPhone] = useState(""); const [maskedPhone, setMaskedPhone] = useState(""); const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const [cooldown, setCooldown] = useState(0);
  const loginUrl = returnTo ? `/${locale}/account?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode() {
    setError(null);
    const normalized = normalizeIranPhone(phone);
    if (!normalized) { setError(t("identifier.invalidPhone")); return; }
    setIsSubmitting(true);
    try {
      const sent = await authService.requestRegisterOtp(username, normalized);
      setNormalizedPhone(normalized); setMaskedPhone(sent.maskedPhone); setCooldown(sent.resendAfterSeconds || DEFAULT_RESEND_SECONDS); setCode(""); setStage("otp");
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally { setIsSubmitting(false); }
  }

  async function submit() {
    setError(null); setIsSubmitting(true);
    try {
      const { user } = await authService.register({ username, password, phone: normalizedPhone, code, displayName: displayName || undefined });
      setUser(user);
      await Promise.all([accountService.setConsent("TERMS", true), accountService.setConsent("PRIVACY", true)]);
      const progress = await onboardingService.getProgress();
      router.replace(resolvePostAuthDestination(locale, returnTo, progress));
    } catch (err) {
      setCode("");
      setError(authErrorMessage(err, t));
    } finally { setIsSubmitting(false); }
  }

  if (stage === "otp") {
    return <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("otp.title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("otp.subtitle", { identifier: maskedPhone })}</p>
      </div>
      <OtpInput value={code} onChange={setCode} errorMessage={error ?? undefined} disabled={isSubmitting} />
      <Button variant="primary" isLoading={isSubmitting} disabled={code.length !== 6} onClick={submit}>{t("register.submit")}</Button>
      <Button variant="ghost" disabled={cooldown > 0 || isSubmitting} onClick={sendCode}>{cooldown > 0 ? t("otp.resendIn", { seconds: cooldown }) : t("otp.resend")}</Button>
      <Button variant="ghost" disabled={isSubmitting} onClick={() => { setStage("details"); setCode(""); setError(null); }}>{t("otp.back")}</Button>
    </div>;
  }

  return <div className="flex flex-col gap-5">
    <h1 className="text-page-title text-text-primary">{t("register.title")}</h1>
    <Input label={t("register.usernameLabel")} autoComplete="username" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} errorMessage={error ?? undefined} autoFocus />
    <PasswordInput label={t("register.passwordLabel")} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    <PasswordInput label={t("register.confirmPasswordLabel")} autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} errorMessage={passwordConfirm && passwordConfirm !== password ? t("register.passwordMismatch") : undefined} />
    <Input label={t("register.displayNameLabel")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
    <div className="flex flex-col gap-1">
      <Input label={t("register.phoneLabel")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <p className="text-metadata text-text-secondary">{t("register.phoneHint")}</p>
    </div>
    <label className="flex items-start gap-2 text-metadata text-text-secondary"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>{t("register.acceptTerms")}</span></label>
    <Button variant="primary" isLoading={isSubmitting} disabled={username.length < 3 || password.length < 8 || password !== passwordConfirm || !phone || !accepted} onClick={sendCode}>{t("register.sendCode")}</Button>
    <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">{t("register.haveAccount")}</Link>
  </div>;
}

export default function RegisterPage() { return <Suspense><RegisterFlow /></Suspense>; }
