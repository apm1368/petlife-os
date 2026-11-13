"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@petlife/ui";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { authService } from "@/services/auth.service";
import { accountService } from "@/services/account.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";
import { normalizeIranPhone } from "@petlife/validation";
import { adminService } from "@/services/admin.service";

function RegisterFlow() {
  const t = useTranslations("auth"); const router = useRouter(); const locale = useLocale(); const searchParams = useSearchParams();
  const copy = ({
    fa: { intro: "ابتدا شماره همراه را وارد کنید؛ سپس مشخصات حساب را بسازید. شماره همراه در این مرحله تأیید پیامکی نمی‌شود.", phone: "شماره همراه", firstName: "نام", lastName: "نام خانوادگی", invalidPhone: "شماره همراه معتبر وارد کنید." },
    en: { intro: "Start with your mobile number, then create your account details. The number is not SMS-verified at this stage.", phone: "Mobile number", firstName: "First name", lastName: "Last name", invalidPhone: "Enter a valid mobile number." },
    de: { intro: "Geben Sie zuerst Ihre Mobilnummer ein und erstellen Sie dann Ihre Kontodaten. Die Nummer wird in dieser Phase nicht per SMS bestätigt.", phone: "Mobilnummer", firstName: "Vorname", lastName: "Nachname", invalidPhone: "Geben Sie eine gültige Mobilnummer ein." },
    es: { intro: "Primero introduce tu número de móvil y luego crea los datos de tu cuenta. En esta fase el número no se verifica por SMS.", phone: "Número de móvil", firstName: "Nombre", lastName: "Apellidos", invalidPhone: "Introduce un número de móvil válido." },
  } as const)[locale as "fa" | "en" | "de" | "es"];
  const returnTo = searchParams.get("returnTo"); const setUser = useSessionStore((s) => s.setUser);
  const [phone, setPhone] = useState(""); const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [passwordConfirm, setPasswordConfirm] = useState(""); const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false);
  const loginUrl = returnTo ? `/${locale}/account?method=password&returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account?method=password`;

  async function submit() {
    setError(null); setIsSubmitting(true);
    try {
      const normalizedPhone = normalizeIranPhone(phone);
      if (!normalizedPhone) { setError(copy.invalidPhone); return; }
      const { user } = await authService.register({ phone: normalizedPhone, firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim(), password });
      setUser(user);
      await Promise.all([accountService.setConsent("TERMS", true), accountService.setConsent("PRIVACY", true)]);
      const [progress, staff] = await Promise.all([onboardingService.getProgress(), adminService.getMe().catch(() => null)]);
      router.replace(resolvePostAuthDestination(locale, returnTo, progress, { isAdmin: !!staff?.isAdmin }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "USERNAME_TAKEN") setError(t("register.usernameTaken"));
      else if (err instanceof ApiError && err.code === "PHONE_INVALID") setError(copy.invalidPhone);
      else setError(t("register.genericError"));
    } finally { setIsSubmitting(false); }
  }

  return <div className="flex flex-col gap-5">
    <h1 className="text-page-title text-text-primary">{t("register.title")}</h1>
    <p className="text-body text-text-secondary">{copy.intro}</p>
    <Input label={copy.phone} type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
    <div className="grid gap-4 sm:grid-cols-2"><Input label={copy.firstName} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} /><Input label={copy.lastName} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
    <Input label={t("register.usernameLabel")} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
    <PasswordInput label={t("register.passwordLabel")} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    <PasswordInput label={t("register.confirmPassword")} autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} errorMessage={passwordConfirm && passwordConfirm !== password ? t("register.passwordMismatch") : undefined} />
    {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
    <label className="flex items-start gap-2 text-metadata text-text-secondary"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>{t("register.terms")}</span></label>
    <Button variant="primary" isLoading={isSubmitting} disabled={!normalizeIranPhone(phone) || !firstName.trim() || !lastName.trim() || username.trim().length < 3 || password.length < 8 || password !== passwordConfirm || !accepted} onClick={submit}>{t("register.submit")}</Button>
    <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">{t("register.haveAccount")}</Link>
  </div>;
}

export default function RegisterPage() { return <Suspense><RegisterFlow /></Suspense>; }
