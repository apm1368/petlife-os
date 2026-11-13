import type { AdminTransactionFilters, AdminTransactionPageDto, ApiErrorBody } from "@petlife/types";
import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api/client";

function toQuery(filters: AdminTransactionFilters, extra: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  }
  return q.toString();
}

/** Admin → Transactions → Explorer: finance.view lists, finance.manage exports (both server-enforced and audited). */
export const adminTransactionsService = {
  list: (filters: AdminTransactionFilters, cursor?: string) =>
    apiFetch<AdminTransactionPageDto>(`/admin/finance/transactions?${toQuery(filters, { cursor, limit: 50 })}`),

  /** The CSV for the same filters; the server caps it and says whether it was cut short. */
  async exportCsv(filters: AdminTransactionFilters): Promise<{ blob: Blob; fileName: string; rows: number; truncated: boolean }> {
    const response = await fetch(`${API_BASE_URL}/admin/finance/transactions/export?${toQuery(filters)}`, { credentials: "include" });
    if (!response.ok) {
      const body = (response.headers.get("content-type")?.includes("application/json") ? await response.json() : undefined) as ApiErrorBody | undefined;
      throw new ApiError(body?.error ?? { code: "UNKNOWN_ERROR", message: response.statusText, requestId: "unknown" }, response.status);
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "transactions.csv";
    return {
      blob: await response.blob(),
      fileName,
      rows: Number(response.headers.get("x-export-rows") ?? "0"),
      truncated: response.headers.get("x-export-truncated") === "1",
    };
  },
};
