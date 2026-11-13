import { sanitizeReturnTo } from "./return-to";

interface OnboardingProgressLike {
  status: string;
  chapter: string;
}

/** What the user is besides a pet owner: a partner (provider or shop membership), and whether they also have a household. */
export interface BusinessLanding {
  hasBusiness: boolean;
  hasHousehold: boolean;
}

/**
 * The single place every sign-in method (OTP, username/password, Google)
 * decides where to send a just-authenticated user — "Auth != onboarding":
 * a new/incomplete account always goes to onboarding first (carrying
 * returnTo along so ReadyStep can finish the job), and only a completed
 * account is sent straight to its original intended destination.
 */
/** Staff and partner consoles: onboarding is the pet-owner flow, so it never stands between someone and these. */
const CONSOLE = /^\/[a-z]{2}\/(admin|provider|seller|insurer|ngo|business)(\/|\?|$)/;

export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike, opts: { isAdmin?: boolean; business?: BusinessLanding | null } = {}): string {
  const isOnboardingComplete = progress.status === "COMPLETED" && progress.chapter === "READY";

  // Someone sent back to a console after signing in goes straight there (the console checks access itself), and an
  // admin signing in with nowhere particular to go lands in admin, not in pet-owner onboarding.
  const target = returnTo ? sanitizeReturnTo(returnTo, "") : "";
  if (target && CONSOLE.test(target)) return target;
  if (opts.isAdmin && !target) return `/${locale}/admin`;

  // A partner who is not also a pet owner lands on their business home and never on the pet-owner onboarding.
  // A pet owner who is also a partner keeps the pet-owner home (the account menu links to the business home).
  if (opts.business?.hasBusiness && !opts.business.hasHousehold) return target || `/${locale}/business`;

  if (!isOnboardingComplete) {
    const onboardingPath = `/${locale}/onboarding`;
    if (!returnTo) return onboardingPath;
    const sanitized = sanitizeReturnTo(returnTo, onboardingPath);
    return sanitized === onboardingPath ? onboardingPath : `${onboardingPath}?returnTo=${encodeURIComponent(sanitized)}`;
  }

  return sanitizeReturnTo(returnTo, `/${locale}/home`);
}

/** The business side of the landing decision; never blocks sign-in (no answer = treat as a pet owner). */
export async function loadBusinessLanding(): Promise<BusinessLanding | null> {
  const { businessService, hasBusiness } = await import("@/services/business.service");
  try {
    const m = await businessService.memberships();
    return { hasBusiness: hasBusiness(m), hasHousehold: m.hasHousehold };
  } catch {
    return null;
  }
}
