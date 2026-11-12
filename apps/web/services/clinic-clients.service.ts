import { apiFetch } from "@/lib/api/client";

export type ClinicSmsMode = "LIVE" | "SANDBOX" | "OFF";
export type ClinicClientStatus = "CLINIC_ONLY" | "INVITED" | "JOINED";
export interface ClinicClientPet { id: string; name: string; species: string | null; breed: string | null; birthDate: string | null; notes: string | null }
export interface ClinicClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  source: "IMPORT" | "MANUAL";
  pets: ClinicClientPet[];
  status: ClinicClientStatus;
  invitedAt: string | null;
  joinedAt: string | null;
  smsOptOut: boolean;
  createdAt: string;
  lastMessageAt?: string | null;
}
export interface ClinicClientMessage { id: string; kind: "MESSAGE" | "REMINDER" | "INVITE"; body: string; status: "SENT" | "SIMULATED" | "FAILED" | "SKIPPED"; failureReason: string | null; createdAt: string }
export interface ClinicClientReminder { id: string; kind: string; title: string; note: string | null; dueAt: string; status: string; petName: string | null; sentAt: string | null }
export interface ClinicClientDetail extends ClinicClient { smsMode: ClinicSmsMode; messages: ClinicClientMessage[]; reminders: ClinicClientReminder[] }
export interface ClinicClientInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  smsOptOut?: boolean;
  pets?: { name: string; species?: string; breed?: string; birthDate?: string }[];
}

const base = "/provider/clinic/clients";
export const clinicClientsService = {
  list: (q: string, signal?: AbortSignal) => apiFetch<{ smsMode: ClinicSmsMode; items: ClinicClient[] }>(`${base}${q ? `?q=${encodeURIComponent(q)}` : ""}`, { signal, cache: "no-store" }),
  get: (id: string, signal?: AbortSignal) => apiFetch<ClinicClientDetail>(`${base}/${encodeURIComponent(id)}`, { signal, cache: "no-store" }),
  create: (body: ClinicClientInput) => apiFetch<ClinicClient>(base, { method: "POST", body }),
  update: (id: string, body: ClinicClientInput) => apiFetch<ClinicClient>(`${base}/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  addPet: (id: string, body: { name: string; species?: string; breed?: string; birthDate?: string }) => apiFetch<ClinicClientDetail>(`${base}/${encodeURIComponent(id)}/pets`, { method: "POST", body }),
  removePet: (id: string, petId: string) => apiFetch<ClinicClientDetail>(`${base}/${encodeURIComponent(id)}/pets/${encodeURIComponent(petId)}`, { method: "DELETE" }),
  message: (id: string, body: string) => apiFetch<{ message: ClinicClientMessage; smsMode: ClinicSmsMode }>(`${base}/${encodeURIComponent(id)}/messages`, { method: "POST", body: { body } }),
  invite: (id: string, locale: "fa" | "en") => apiFetch<{ message: ClinicClientMessage; smsMode: ClinicSmsMode; invitedAt: string }>(`${base}/${encodeURIComponent(id)}/invite`, { method: "POST", body: { locale } }),
  remind: (body: { contactId: string; clientPetId?: string; kind: string; title: string; note?: string; dueAt?: string }) => apiFetch<{ id: string; status: string }>("/provider/clinic/reminders", { method: "POST", body }),
  previewInvite: (token: string, signal?: AbortSignal) => apiFetch<{ clinicName: string; pets: string[]; joined: boolean }>(`/me/clinic-client-invites/${encodeURIComponent(token)}`, { signal, cache: "no-store" }),
  acceptInvite: (token: string) => apiFetch<{ clinicName: string; joined: boolean }>(`/me/clinic-client-invites/${encodeURIComponent(token)}/accept`, { method: "POST" }),
};
