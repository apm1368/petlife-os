import type { PetYearReviewDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const petYearReviewService = {
  get: (petId: string, from: string, to: string) => apiFetch<PetYearReviewDto>(`/pets/${petId}/year-review?from=${from}&to=${to}`),
};
