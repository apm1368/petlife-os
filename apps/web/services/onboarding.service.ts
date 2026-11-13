import type { OnboardingChapter, OnboardingStatus, PetInterest } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface OnboardingProgressDto {
  userId: string;
  householdId: string | null;
  petId: string | null;
  chapter: OnboardingChapter;
  step: string;
  status: OnboardingStatus;
  completedSteps: string[];
  lastCompletedAt: string | null;
  /** PARTNER accounts (partner signup) are never sent into this pet-owner onboarding. */
  signupIntent?: "PET_OWNER" | "PARTNER";
}

export interface UpdateProgressInput {
  chapter: OnboardingChapter;
  step: string;
  status: OnboardingStatus;
  householdId?: string;
  petId?: string;
  interests?: PetInterest[];
}

export const onboardingService = {
  getProgress: () => apiFetch<OnboardingProgressDto>("/onboarding"),

  updateProgress: (input: UpdateProgressInput) =>
    apiFetch<OnboardingProgressDto>("/onboarding/progress", { method: "PUT", body: input }),

  complete: (idempotencyKey: string) =>
    apiFetch<OnboardingProgressDto>("/onboarding/complete", { method: "POST", idempotencyKey }),
};
