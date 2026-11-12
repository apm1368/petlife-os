import { apiFetch } from "@/lib/api/client";

export interface MessagingStatus {
  checkedAt: string;
  sms: {
    provider: "dev" | "faraz" | "kavenegar";
    mode: "sandbox" | "production";
    otpProvider: "dev" | "faraz" | "kavenegar";
    live: boolean;
    otpLive: boolean;
    /** Which real provider the setup checklist describes (Kavenegar once it handles notifications or sign-in codes). */
    setupProvider?: "faraz" | "kavenegar";
    senderMasked: string | null;
    apiKeyConfigured: boolean;
    otpPatternConfigured: boolean;
    notificationPatternConfigured: boolean;
    activePatternBindings: number;
    missingConfiguration: string[];
    lastSentAt: string | null;
  };
  email: {
    provider: "disabled" | "dev" | "gmail" | "smtp";
    live: boolean;
    fromAddress: string | null;
    fromName: string;
    missingConfiguration: string[];
    lastSentAt: string | null;
  };
  last7Days: { channel: string; status: string; count: number }[];
}

export interface MessagingDelivery {
  id: string;
  channel: "SMS" | "EMAIL";
  status: string;
  provider: string | null;
  destinationMasked: string | null;
  templateKey: string | null;
  userId: string | null;
  attemptCount: number;
  failureKind: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  skipReason: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
}

export type TestResult = { status: "SENT" | "FAILED"; failureCode: string | null; failureMessage: string | null };

export const adminMessagingService = {
  status: (signal?: AbortSignal) => apiFetch<MessagingStatus>("/admin/messaging/status", { signal, cache: "no-store" }),
  deliveries: (params: URLSearchParams, signal?: AbortSignal) =>
    apiFetch<{ items: MessagingDelivery[]; total: number; page: number; pageSize: number }>(`/admin/messaging/deliveries?${params}`, { signal, cache: "no-store" }),
  testSms: (phone: string) => apiFetch<TestResult & { provider: string }>("/admin/messaging/test-sms", { method: "POST", body: { phone } }),
  testEmail: (to: string, locale: string) => apiFetch<TestResult>("/admin/messaging/test-email", { method: "POST", body: { to, locale } }),
  verifyEmail: () => apiFetch<{ ok: boolean; message: string | null }>("/admin/messaging/verify-email", { method: "POST", body: {} }),
};
