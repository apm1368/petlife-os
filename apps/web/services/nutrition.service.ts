import type { DietType, NutritionProfileDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UpdateNutritionInput {
  dietType?: DietType;
  currentFoodText?: string;
  feedingFrequencyText?: string;
  restrictionsText?: string;
}

export const nutritionService = {
  get: (petId: string) => apiFetch<NutritionProfileDto>(`/pets/${petId}/nutrition`),
  upsert: (petId: string, input: UpdateNutritionInput) =>
    apiFetch<NutritionProfileDto>(`/pets/${petId}/nutrition`, { method: "PUT", body: input }),
};
