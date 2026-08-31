import { create } from "zustand";
import type { PetInterest, PetSex, PetSpecies, WeightUnit } from "@petlife/types";

export interface OnboardingDraft {
  householdId: string | null;
  petId: string | null;
  species: PetSpecies | null;
  name: string;
  photoUrl: string | null;
  breed: string | null;
  sex: PetSex | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  latestWeightValue: number | null;
  latestWeightUnit: WeightUnit | null;
  interests: PetInterest[];
}

interface OnboardingState extends OnboardingDraft {
  update: (patch: Partial<OnboardingDraft>) => void;
  reset: () => void;
}

const initialDraft: OnboardingDraft = {
  householdId: null,
  petId: null,
  species: null,
  name: "",
  photoUrl: null,
  breed: null,
  sex: null,
  birthDate: null,
  approximateAgeMonths: null,
  latestWeightValue: null,
  latestWeightUnit: null,
  interests: [],
};

/** Holds in-progress onboarding answers across wizard steps until the pet record exists on the server. */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialDraft,
  update: (patch) => set(patch),
  reset: () => set(initialDraft),
}));
