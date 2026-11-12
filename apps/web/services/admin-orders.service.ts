import type { AdminOrderDetailDto, AdminOrderSection, AdminOrdersPageDto } from "@petlife/types";
import { API_BASE_URL, apiFetch, ApiError, assertSafeApiPath } from "@/lib/api/client";

export interface AdminOrdersParams {
  section: AdminOrderSection | "ALL";
  q?: string;
  status?: string;
  stage?: string;
  payment?: string;
  partnerId?: string;
  customerId?: string;
  city?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
}

export function ordersQuery(p: AdminOrdersParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  return qs.toString();
}

/** Admin → Orders. */
export const adminOrdersService = {
  list: (p: AdminOrdersParams, signal?: AbortSignal) => apiFetch<AdminOrdersPageDto>(`/admin/orders?${ordersQuery(p)}`, { signal, cache: "no-store" }),
  detail: (section: AdminOrderSection, id: string, signal?: AbortSignal) => apiFetch<AdminOrderDetailDto>(`/admin/orders/${section}/${encodeURIComponent(id)}`, { signal, cache: "no-store" }),
  revealPhone: (userId: string, reason: string) => apiFetch<{ field: "phone"; value: string }>(`/admin/customers/${encodeURIComponent(userId)}/reveal`, { method: "POST", body: { field: "phone", reason } }),
  /** The server builds the CSV (masked, formula-safe, audited); the browser only saves it. */
  async exportCsv(p: AdminOrdersParams): Promise<void> {
    const { before: _b, limit: _l, ...rest } = p;
    const path = `/admin/orders/export?${ordersQuery(rest)}`;
    assertSafeApiPath(path);
    const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string; requestId: string; details?: Record<string, unknown> } } | null;
      throw new ApiError(body?.error ?? { code: "UNKNOWN_ERROR", message: res.statusText, requestId: "export" }, res.status);
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "opetlife-orders.csv";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
