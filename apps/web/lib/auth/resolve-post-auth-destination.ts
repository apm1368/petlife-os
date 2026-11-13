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
export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike, business?: BusinessLanding | null): string {
  const isOnboardingComplete = progress.status === "COMPLETED" && progress.chapter === "READY";

  // A partner who is not also a pet owner lands on their business home and never on the pet-owner onboarding.
  // A pet owner who is also a partner keeps the pet-owner home (the account menu links to the business home).
  if (business?.hasBusiness && !business.hasHousehold) return sanitizeReturnTo(returnTo, `/${locale}/business`);

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
