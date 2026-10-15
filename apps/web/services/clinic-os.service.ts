import { apiFetch } from "@/lib/api/client";
export interface ClinicTask {
    id: string;
    type: string;
    title: string;
    status: string;
    dueAt: string | null;
    overdue: boolean;
}
export interface ClinicCustomer {
    householdId: string;
    ownerDisplayName: string | null;
    pets: {
        id: string;
        name: string;
        species: string;
    }[];
    completedVisitCount: number;
    lastVisitAt: string | null;
}
export interface ClinicPlan {
    code: string;
    nameFa: string;
    nameEn: string;
    descriptionFa: string;
    descriptionEn: string;
    entitlements: {
        key: string;
        type: string;
        enabled: boolean;
        limit: number | null;
    }[];
}
export interface ClinicSubscription {
    status: string;
    plan: ClinicPlan;
    currentPeriodEndsAt: string | null;
    usage: {
        remindersThisMonth: number;
    };
}
export interface ClinicQueueRow {
    bookingId: string;
    bookingNumber: string;
    startAt: string;
    serviceName: string;
    ownerDisplayName: string | null;
    pet: {
        id: string;
        name: string;
    };
    assignedTo: {
        name: string;
    } | null;
}
export interface ClinicNote {
    id: string;
    body: string;
    visibleToOwner: boolean;
    authorProviderUserId: string;
    authorName: string | null;
    createdAt: string;
}
export const clinicOsService = {
    notes: (householdId: string, signal?: AbortSignal) => apiFetch<ClinicNote[]>(`/provider/clinic/customers/${householdId}/notes`, { signal }),
    addNote: (householdId: string, body: {
        body: string;
        visibleToOwner: boolean;
    }) => apiFetch<ClinicNote[]>(`/provider/clinic/customers/${householdId}/notes`, { method: "POST", body }),
    removeNote: (householdId: string, noteId: string) => apiFetch<ClinicNote[]>(`/provider/clinic/customers/${householdId}/notes/${noteId}`, { method: "DELETE" }),
    subscription: (signal?: AbortSignal) => apiFetch<ClinicSubscription>("/provider/clinic/subscription", { signal }),
    tasks: (status: string, signal?: AbortSignal) => apiFetch<ClinicTask[]>(`/provider/clinic/tasks?status=${encodeURIComponent(status)}`, { signal }),
    createTask: (body: {
        title: string;
        type: string;
        dueAt?: string;
    }) => apiFetch<ClinicTask[]>("/provider/clinic/tasks", { method: "POST", body }),
    completeTask: (id: string) => apiFetch<ClinicTask[]>(`/provider/clinic/tasks/${id}/done`, { method: "POST" }),
    cancelTask: (id: string) => apiFetch<ClinicTask[]>(`/provider/clinic/tasks/${id}/cancel`, { method: "POST" }),
    customers: (q: string, page: number, signal?: AbortSignal) => apiFetch<{
        items: ClinicCustomer[];
        total: number;
        page: number;
        pageSize: number;
    }>(`/provider/clinic/customers?${q.trim() ? `q=${encodeURIComponent(q.trim())}&` : ""}page=${page}&pageSize=20`, { signal }),
    queue: (date: string, signal?: AbortSignal) => apiFetch<{
        date: string;
        buckets: Record<string, ClinicQueueRow[]>;
    }>(`/provider/clinic/queue?date=${date}`, { signal }),
};
