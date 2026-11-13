import { sanitizeReturnTo } from "./return-to";

interface OnboardingProgressLike {
  status: string;
  chapter: string;
  /** PARTNER = the account came through partner signup ("ثبت‌نام همکار"). */
  signupIntent?: string;
  /** Partner signup progress: IN_PROGRESS while the wizard is unfinished, SUBMITTED once handed to KYC (or verified). */
  partnerStage?: string;
}

/** What the user is besides a pet owner: a partner (provider or shop membership), and whether they also have a household. */
export interface BusinessLanding {
  hasBusiness: boolean;
  hasHousehold: boolean;
}

/** The partner signup page: the wizard for signed-in partners, the introduction otherwise. */
export const partnerJoinPath = (locale: string) => `/${locale}/partners/join`;

/**
 * The single place every sign-in method (OTP, username/password, Google)
 * decides where to send a just-authenticated user — "Auth != onboarding":
 * a new/incomplete account always goes to onboarding first (carrying
 * returnTo along so ReadyStep can finish the job), and only a completed
 * account is sent straight to its original intended destination.
 *
 * Partners never go to the pet-owner onboarding: a partner account (or anyone signing in on the way into the partner
 * area) continues the partner wizard until it is submitted, then lands on the business home.
 */
export function resolvePostAuthDestination(locale: string, returnTo: string | null | undefined, progress: OnboardingProgressLike, business?: BusinessLanding | null): string {
  const isOnboardingComplete = progress.status === "COMPLETED" && progress.chapter === "READY";

  // Only a safe returnTo that really points into the partner area counts; an unsafe one never becomes a partner
  // target through a fallback.
  const safeReturn = returnTo ? sanitizeReturnTo(returnTo, "") : "";
  const intoPartnerArea = safeReturn.startsWith(partnerJoinPath(locale));
  if (progress.signupIntent === "PARTNER" || intoPartnerArea) {
    if (progress.partnerStage === "SUBMITTED") return safeReturn || `/${locale}/business`;
    return intoPartnerArea ? safeReturn : partnerJoinPath(locale);
  }

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
