import { sanitizeReturnTo } from "./return-to";

interface OnboardingProgressLike {
  status: string;
  chapter: string;
  signupIntent?: string;
}

<<<<<<< HEAD
/** Where a partner continues: the partner signup wizard (which shows the review status once submitted). */
export const partnerHomePath = (locale: string) => `/${locale}/partners/onboarding`;
=======
/** What the user is besides a pet owner: a partner (provider or shop membership), and whether they also have a household. */
export interface BusinessLanding {
  hasBusiness: boolean;
  hasHousehold: boolean;
}
>>>>>>> origin/claude/partner-business-hub

/**
 * The single place every sign-in method (OTP, username/password, Google)
 * decides where to send a just-authenticated user — "Auth != onboarding":
 * a new/incomplete account always goes to onboarding first (carrying
 * returnTo along so ReadyStep can finish the job), and only a completed
 * account is sent straight to its original intended destination.
 */
<<<<<<< HEAD
export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike): string {
  // Partner signup ("ثبت‌نام همکار"): a partner account, or anyone signing in on the way into the partner area, goes
  // to the partner flow — never into the pet-owner onboarding.
  const partnerHome = partnerHomePath(locale);
  const partnerTarget = returnTo ? sanitizeReturnTo(returnTo, partnerHome) : null;
  if (progress.signupIntent === "PARTNER" || partnerTarget?.startsWith(`/${locale}/partners/`)) {
    return partnerTarget ?? partnerHome;
  }

=======
export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike, business?: BusinessLanding | null): string {
>>>>>>> origin/claude/partner-business-hub
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
