import { apiFetch } from "@/lib/api/client";
export interface CareReminder {
  id: string; petId: string; title: string; type: string; source: string; sourceId: string | null;
  dueAt: string; originalDueAt: string; snoozedUntil: string | null; state: string;
  recurrence: string; intervalDays: number | null; completedAt: string | null; notifiedAt: string | null; cancelledAt: string | null; parentId: string | null;
}
export interface ReminderInput { title: string; type: string; dueAt: string; recurrence: string; intervalDays?: number }
const base = (petId: string) => `/pets/${petId}/care-items`;
export const careRemindersService = {
  list: (petId: string) => apiFetch<CareReminder[]>(base(petId)),
  get: (petId: string, id: string) => apiFetch<CareReminder>(`${base(petId)}/${id}`),
  create: (petId: string, input: ReminderInput) => apiFetch<CareReminder>(base(petId), { method: "POST", body: input }),
  edit: (petId: string, id: string, input: Partial<ReminderInput>) => apiFetch<CareReminder>(`${base(petId)}/${id}`, { method: "PATCH", body: input }),
  act: (petId: string, id: string, action: string, at?: string) => apiFetch<CareReminder>(`${base(petId)}/${id}/actions`, { method: "POST", body: { action, at } }),
};
