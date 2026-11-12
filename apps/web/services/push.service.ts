import { apiFetch } from "@/lib/api/client";

export interface PushConfigDto {
  enabled: boolean;
  publicKey: string | null;
}

export interface PushDeviceDto {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
}

export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

/** Web Push opt-in for this browser / installed app. Every route acts only on the signed-in member's own devices. */
export const pushService = {
  config: () => apiFetch<PushConfigDto>("/push/config"),
  devices: () => apiFetch<{ devices: PushDeviceDto[] }>("/push/subscriptions"),
  subscribe: (body: PushSubscriptionBody) => apiFetch<PushDeviceDto>("/push/subscriptions", { method: "POST", body }),
  unsubscribe: (endpoint: string) => apiFetch<{ removed: number }>("/push/subscriptions/remove", { method: "POST", body: { endpoint } }),
  remove: (id: string) => apiFetch<{ removed: number }>(`/push/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  test: (endpoint: string, locale: string) => apiFetch<{ sent: number; failed: number }>("/push/subscriptions/test", { method: "POST", body: { endpoint, locale } }),
};
