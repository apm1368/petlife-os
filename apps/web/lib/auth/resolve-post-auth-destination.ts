import { sanitizeReturnTo } from "./return-to";

interface OnboardingProgressLike {
  status: string;
  chapter: string;
  signupIntent?: string;
}

/** Where a partner continues: the partner signup wizard (which shows the review status once submitted). */
export const partnerHomePath = (locale: string) => `/${locale}/partners/onboarding`;

/**
 * The single place every sign-in method (OTP, username/password, Google)
 * decides where to send a just-authenticated user — "Auth != onboarding":
 * a new/incomplete account always goes to onboarding first (carrying
 * returnTo along so ReadyStep can finish the job), and only a completed
 * account is sent straight to its original intended destination.
 */
export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike): string {
  // Partner signup ("ثبت‌نام همکار"): a partner account, or anyone signing in on the way into the partner area, goes
  // to the partner flow — never into the pet-owner onboarding.
  const partnerHome = partnerHomePath(locale);
  const partnerTarget = returnTo ? sanitizeReturnTo(returnTo, partnerHome) : null;
  if (progress.signupIntent === "PARTNER" || partnerTarget?.startsWith(`/${locale}/partners/`)) {
    return partnerTarget ?? partnerHome;
  }

  const isOnboardingComplete = progress.status === "COMPLETED" && progress.chapter === "READY";

  if (!isOnboardingComplete) {
    const onboardingPath = `/${locale}/onboarding`;
    if (!returnTo) return onboardingPath;
    const sanitized = sanitizeReturnTo(returnTo, onboardingPath);
    return sanitized === onboardingPath ? onboardingPath : `${onboardingPath}?returnTo=${encodeURIComponent(sanitized)}`;
  }

  return sanitizeReturnTo(returnTo, `/${locale}/home`);
}
