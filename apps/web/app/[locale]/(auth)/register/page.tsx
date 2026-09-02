"use client";

import { Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { onboardingService } from "@/services/onboarding.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

function RegisterFlow() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const setUser = useSessionStore((s) => s.setUser);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginUrl = returnTo ? `/${locale}/account?method=password&returnTo=${encodeURIComponent(returnTo)}` : `/${locale}/account?method=password`;

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const { user } = await authService.register({ username, password, displayName: displayName || undefined, email: email || undefined });
      setUser(user);
      const progress = await onboardingService.getProgress();
      router.replace(resolvePostAuthDestination(locale, returnTo, progress));
    } catch (err) {
      if (err instanceof ApiError && err.code === "USERNAME_TAKEN") {
        setError(t("register.usernameTaken"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("register.title")}</h1>
      <Input label={t("register.usernameLabel")} value={username} onChange={(e) => setUsername(e.target.value)} errorMessage={error ?? undefined} autoFocus />
      <Input label={t("register.passwordLabel")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Input label={t("register.displayNameLabel")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Input label={t("register.emailLabel")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button variant="primary" isLoading={isSubmitting} disabled={username.length < 3 || password.length < 8} onClick={submit}>
        {t("register.submit")}
      </Button>
      <Link href={loginUrl} className="text-center text-metadata text-text-secondary underline">
        {t("register.haveAccount")}
      </Link>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterFlow />
    </Suspense>
  );
}
