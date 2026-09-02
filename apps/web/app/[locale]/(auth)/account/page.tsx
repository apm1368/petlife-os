"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input, OtpInput } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

const RESEND_COOLDOWN_SECONDS = 30;

function AccountFlow() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const method = searchParams.get("method") === "phone" ? "phone" : searchParams.get("method") === "password" ? "password" : "email";
  const returnTo = searchParams.get("returnTo");
  const router = useRouter();
  const locale = useLocale();
  const setUser = useSessionStore((s) => s.setUser);

  const [stage, setStage] = useState<"identifier" | "otp">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function afterAuth() {
    const progress = await onboardingService.getProgress();
    router.replace(resolvePostAuthDestination(locale, returnTo, progress));
  }

  async function sendCode() {
    setError(null);
    setIsSubmitting(true);
    try {
      await authService.requestOtp(identifier);
      setStage("otp");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verify() {
    setError(null);
    setIsSubmitting(true);
    try {
      const { user } = await authService.verifyOtp(identifier, code);
      setUser(user);
      await afterAuth();
    } catch (err) {
      setError(mapError(err, t));
      setCode(""); // keep the OTP layout in place — clear the digits, not the screen
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loginWithPassword() {
    setError(null);
    setIsSubmitting(true);
    try {
      const { user } = await authService.loginPassword(identifier, password);
      setUser(user);
      await afterAuth();
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (method === "password") {
    const forgotUrl = returnTo ? `/${locale}/account/forgot?returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account/forgot`;
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("welcome.title")}</h1>
        <Input label={t("password.usernameLabel")} value={identifier} onChange={(e) => setIdentifier(e.target.value)} errorMessage={error ?? undefined} autoFocus />
        <Input label={t("password.passwordLabel")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button variant="primary" isLoading={isSubmitting} disabled={!identifier || !password} onClick={loginWithPassword}>
          {t("password.login")}
        </Button>
        <Link href={forgotUrl} className="text-center text-metadata text-text-secondary underline">
          {t("password.forgotPassword")}
        </Link>
      </div>
    );
  }

  if (stage === "identifier") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("welcome.title")}</h1>
        <Input
          label={method === "email" ? t("identifier.emailLabel") : t("identifier.phoneLabel")}
          type={method === "email" ? "email" : "tel"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          errorMessage={error ?? undefined}
          autoFocus
        />
        <Button variant="primary" isLoading={isSubmitting} disabled={!identifier} onClick={sendCode}>
          {t("identifier.sendCode")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("otp.title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("otp.subtitle", { identifier })}</p>
      </div>
      <OtpInput value={code} onChange={setCode} errorMessage={error ?? undefined} disabled={isSubmitting} />
      <Button variant="primary" isLoading={isSubmitting} disabled={code.length !== 6} onClick={verify}>
        {t("otp.verify")}
      </Button>
      <Button variant="ghost" disabled={cooldown > 0} onClick={sendCode}>
        {cooldown > 0 ? t("otp.resendIn", { seconds: cooldown }) : t("otp.resend")}
      </Button>
    </div>
  );
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations<"auth">>): string {
  if (err instanceof ApiError) {
    if (err.code === "OTP_INVALID") return t("otp.invalid");
    if (err.code === "OTP_RATE_LIMITED") {
      const seconds = typeof err.details?.retryAfterSeconds === "number" ? err.details.retryAfterSeconds : 60;
      return t("otp.rateLimited", { seconds });
    }
    if (err.code === "INVALID_CREDENTIALS") return t("password.invalidCredentials");
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountFlow />
    </Suspense>
  );
}
