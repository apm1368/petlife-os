"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { normalizeIranPhone } from "@petlife/validation";
import { Button, Input, OtpInput } from "@petlife/ui";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { authErrorMessage } from "@/features/auth/auth-error";
import { authService, type LoginStartDto } from "@/services/auth.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

const DEFAULT_RESEND_SECONDS = 30;

/** Sign-in: username + password, then the code texted to the account's mobile. */
function AccountFlow() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const router = useRouter();
  const locale = useLocale();
  const setUser = useSessionStore((s) => s.setUser);

  const [stage, setStage] = useState<"credentials" | "phone" | "otp">("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function restart() {
    setStage("credentials");
    setChallengeId("");
    setCode("");
  }

  function applyStart(result: LoginStartDto) {
    setChallengeId(result.challengeId);
    if (result.status === "PHONE_REQUIRED") {
      setStage("phone");
      return;
    }
    setMaskedPhone(result.maskedPhone);
    setCooldown(result.resendAfterSeconds || DEFAULT_RESEND_SECONDS);
    setCode("");
    setStage("otp");
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err, t));
      if (err instanceof ApiError && err.code === "LOGIN_CHALLENGE_INVALID") restart();
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitPassword = () => run(async () => applyStart(await authService.loginPassword(username, password)));

  const submitPhone = () =>
    run(async () => {
      const normalized = normalizeIranPhone(phone);
      if (!normalized) {
        setError(t("identifier.invalidPhone"));
        return;
      }
      applyStart(await authService.loginPhone(challengeId, normalized));
    });

  const resend = () => run(async () => applyStart(await authService.loginResend(challengeId)));

  const verify = () =>
    run(async () => {
      try {
        const { user } = await authService.loginVerify(challengeId, code);
        setUser(user);
        const progress = await onboardingService.getProgress();
        router.replace(resolvePostAuthDestination(locale, returnTo, progress));
      } catch (err) {
        setCode(""); // keep the OTP layout in place — clear the digits, not the screen
        throw err;
      }
    });

  const forgotUrl = returnTo ? `/${locale}/account/forgot?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account/forgot`;
  const registerUrl = returnTo ? `/${locale}/register?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/register`;

  if (stage === "phone") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-page-title text-text-primary">{t("password.phoneRequiredTitle")}</h1>
          <p className="mt-1 text-body text-text-secondary">{t("password.phoneRequiredBody")}</p>
        </div>
        <Input label={t("identifier.phoneLabel")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} errorMessage={error ?? undefined} autoFocus />
        <Button variant="primary" isLoading={isSubmitting} disabled={!phone} onClick={submitPhone}>
          {t("identifier.sendCode")}
        </Button>
        <Button variant="ghost" disabled={isSubmitting} onClick={restart}>{t("otp.back")}</Button>
      </div>
    );
  }

  if (stage === "otp") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-page-title text-text-primary">{t("otp.title")}</h1>
          <p className="mt-1 text-body text-text-secondary">{t("otp.subtitle", { identifier: maskedPhone })}</p>
        </div>
        <OtpInput value={code} onChange={setCode} errorMessage={error ?? undefined} disabled={isSubmitting} />
        <Button variant="primary" isLoading={isSubmitting} disabled={code.length !== 6} onClick={verify}>
          {t("otp.verify")}
        </Button>
        <Button variant="ghost" disabled={cooldown > 0 || isSubmitting} onClick={resend}>
          {cooldown > 0 ? t("otp.resendIn", { seconds: cooldown }) : t("otp.resend")}
        </Button>
        <Button variant="ghost" disabled={isSubmitting} onClick={restart}>{t("otp.back")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("welcome.title")}</h1>
      <Input label={t("password.usernameLabel")} autoComplete="username" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} errorMessage={error ?? undefined} autoFocus />
      <PasswordInput label={t("password.passwordLabel")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button variant="primary" isLoading={isSubmitting} disabled={!username || !password} onClick={submitPassword}>
        {t("password.login")}
      </Button>
      <Link href={forgotUrl} className="text-center text-metadata text-text-secondary underline">
        {t("password.forgotPassword")}
      </Link>
      <Link href={registerUrl} className="text-center text-metadata text-text-secondary underline">
        {t("password.noAccount")}
      </Link>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountFlow />
    </Suspense>
  );
}
