import type { CareProfileDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UpdateCareProfileInput {
  temperamentText?: string;
  aroundPeopleText?: string;
  aroundAnimalsText?: string;
  leashBehaviorText?: string;
  handlingSensitivityText?: string;
  feedingRoutineText?: string;
  toiletRoutineText?: string;
  separationBehaviorText?: string;
  specialInstructionsText?: string;
}

export const careProfileService = {
  get: (petId: string) => apiFetch<CareProfileDto>(`/pets/${petId}/care-profile`),
  upsert: (petId: string, input: UpdateCareProfileInput) =>
    apiFetch<CareProfileDto>(`/pets/${petId}/care-profile`, { method: "PUT", body: input }),
};
