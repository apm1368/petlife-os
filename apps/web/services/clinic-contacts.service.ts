import { apiFetch } from "@/lib/api/client";
export interface ClinicContact { id: string; name: string; phone: string | null; email: string | null; petName: string | null; species: string | null; notes: string | null; createdAt: string }
export interface ContactImportResult {
  dryRun: boolean; totalRows: number; validRows: number; imported: number; confirmationToken?: string;
  errors: { row: number; field: string; reason: string }[];
  duplicates: { row: number; matches: "FILE" | "EXISTING"; field: "phone" | "email" }[];
}
export type ClinicExportKind = "customers" | "appointments" | "services" | "contacts";
export const clinicContactsService = {
  list: (q: string, signal?: AbortSignal) => apiFetch<ClinicContact[]>(`/provider/clinic/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { signal }),
  preview: (csv: string) => apiFetch<ContactImportResult>("/provider/clinic/contacts/import", { method: "POST", body: { csv, dryRun: true } }),
  import: (csv: string, confirmationToken: string) => apiFetch<ContactImportResult>("/provider/clinic/contacts/import", { method: "POST", body: { csv, dryRun: false, confirmationToken } }),
  export: (kind: ClinicExportKind) => apiFetch<{ filename: string; contentType: string; csv: string }>(`/provider/clinic/exports/${kind}`),
};
