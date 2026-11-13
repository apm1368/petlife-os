import type { AdminShipmentListItemDto, AdminShippingOverviewDto, PaginatedDto, ShipmentStatus, ShippingProvider } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** Back-office shipping: method switches/prices (commerce.manage), shipments and staff updates for staff-run methods. */
export const adminShippingService = {
  methods: () => apiFetch<AdminShippingOverviewDto>("/admin/shipping/methods"),
  updateMethod: (provider: ShippingProvider, input: { enabled: boolean; config?: object; reason?: string }) =>
    apiFetch<AdminShippingOverviewDto>(`/admin/shipping/methods/${provider}`, { method: "PUT", body: input }),
  shipments: (filter: { provider?: ShippingProvider; status?: ShipmentStatus; page?: number }) => {
    const q = new URLSearchParams({ page: String(filter.page ?? 1), pageSize: "20" });
    if (filter.provider) q.set("provider", filter.provider);
    if (filter.status) q.set("status", filter.status);
    return apiFetch<PaginatedDto<AdminShipmentListItemDto>>(`/admin/shipping/shipments?${q.toString()}`);
  },
  updateShipment: (id: string, input: { status: ShipmentStatus; trackingCode?: string; note?: string }) =>
    apiFetch<{ applied: boolean }>(`/admin/shipping/shipments/${id}/status`, { method: "POST", body: input }),
};
