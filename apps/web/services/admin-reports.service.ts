import type { AdminReportGranularity, AdminReportOverviewDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type ReportQuery = { from?: string; to?: string; granularity?: AdminReportGranularity };

/** ERP reports (analytics.view): live aggregates, never cached. */
export const adminReportsService = {
  overview: (query: ReportQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.granularity) params.set("granularity", query.granularity);
    return apiFetch<AdminReportOverviewDto>(`/admin/reports/overview?${params}`, { signal, cache: "no-store" });
  },
};
