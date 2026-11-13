import { sanitizeReturnTo } from "./return-to";

interface OnboardingProgressLike {
  status: string;
  chapter: string;
}

/**
 * The single place every sign-in method (OTP, username/password, Google)
 * decides where to send a just-authenticated user — "Auth != onboarding":
 * a new/incomplete account always goes to onboarding first (carrying
 * returnTo along so ReadyStep can finish the job), and only a completed
 * account is sent straight to its original intended destination.
 */
/** Staff and partner consoles: onboarding is the pet-owner flow, so it never stands between someone and these. */
const CONSOLE = /^\/[a-z]{2}\/(admin|provider|seller|insurer|ngo)(\/|\?|$)/;

export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike, opts: { isAdmin?: boolean } = {}): string {
  const isOnboardingComplete = progress.status === "COMPLETED" && progress.chapter === "READY";

  // Someone sent back to a console after signing in goes straight there (the console checks access itself), and an
  // admin signing in with nowhere particular to go lands in admin, not in pet-owner onboarding.
  const target = returnTo ? sanitizeReturnTo(returnTo, "") : "";
  if (target && CONSOLE.test(target)) return target;
  if (opts.isAdmin && !target) return `/${locale}/admin`;

  if (!isOnboardingComplete) {
    const onboardingPath = `/${locale}/onboarding`;
    if (!returnTo) return onboardingPath;
    const sanitized = sanitizeReturnTo(returnTo, onboardingPath);
    return sanitized === onboardingPath ? onboardingPath : `${onboardingPath}?returnTo=${encodeURIComponent(sanitized)}`;
  }

  return sanitizeReturnTo(returnTo, `/${locale}/home`);
}
