import type { CareCalendarEventDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const careCalendarService = {
  list: (petId?: string) => apiFetch<CareCalendarEventDto[]>(`/care-calendar${petId ? `?petId=${petId}` : ""}`),
};
