import { apiFetch } from "@/lib/api/client";
import type { HelpArticle, LegalKind, PublicIncident } from "@/services/help-center.service";

export interface AdminHelpArticle extends HelpArticle { categoryId: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; publishedVersion: number | null }
export interface AdminHelpCategory { id: string; slug: string; titleFa: string; titleEn: string | null; isActive: boolean }
export interface AdminHelpVersion { id: string; versionNumber: number; editorAdminId: string; changeNote: string | null; createdAt: string }
export interface AdminLegalVersion { id: string; versionNumber: number; title: string; body: string; effectiveAt: string; publishedAt: string | null; changeNote: string | null; createdAt: string }
export interface AdminLegalDocument { id: string; kind: LegalKind; locale: "fa" | "en"; publishedVersion: number | null; latestVersion: number | null; updatedAt: string }
export interface AdminMaintenance { id: string; title: string; message: string | null; startsAt: string; endsAt: string; cancelledAt: string | null }

function query(input: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value) params.set(key, value);
  return params.size ? `?${params}` : "";
}

export const adminHelpCenterService = {
  categories: () => apiFetch<AdminHelpCategory[]>("/admin/help/categories"),
  createCategory: (input: { slug: string; titleFa: string; titleEn: string }) => apiFetch<AdminHelpCategory>("/admin/help/categories", { method: "POST", body: input }),
  articles: (locale?: "fa" | "en") => apiFetch<AdminHelpArticle[]>(`/admin/help/articles${query({ locale })}`),
  saveArticle: (input: { id?: string; categoryId: string; locale: "fa" | "en"; slug: string; title: string; summary?: string; body: string; isFaq: boolean }) => {
    const { id, ...body } = input;
    return id ? apiFetch<AdminHelpArticle>(`/admin/help/articles/${id}`, { method: "PUT", body }) : apiFetch<AdminHelpArticle>("/admin/help/articles", { method: "POST", body });
  },
  publishArticle: (id: string, version?: number) => apiFetch<AdminHelpArticle>(`/admin/help/articles/${id}/publish`, { method: "POST", body: version ? { version } : {} }),
  unpublishArticle: (id: string) => apiFetch<AdminHelpArticle>(`/admin/help/articles/${id}/unpublish`, { method: "POST" }),
  articleVersions: (id: string) => apiFetch<AdminHelpVersion[]>(`/admin/help/articles/${id}/versions`),
  rollbackArticle: (id: string, version: number) => apiFetch<AdminHelpArticle>(`/admin/help/articles/${id}/rollback`, { method: "POST", body: { version } }),
  legalDocuments: () => apiFetch<AdminLegalDocument[]>("/admin/legal"),
  legalVersions: (kind: LegalKind, locale: "fa" | "en") => apiFetch<AdminLegalVersion[]>(`/admin/legal/versions${query({ kind, locale })}`),
  saveLegalVersion: (input: { kind: LegalKind; locale: "fa" | "en"; title: string; body: string; effectiveAt: string; changeNote?: string }) => apiFetch<AdminLegalVersion>("/admin/legal/versions", { method: "POST", body: input }),
  publishLegalVersion: (kind: LegalKind, locale: "fa" | "en", version: number) => apiFetch<AdminLegalDocument>("/admin/legal/publish", { method: "POST", body: { kind, locale, version } }),
  unpublishLegal: (kind: LegalKind, locale: "fa" | "en") => apiFetch<AdminLegalDocument>("/admin/legal/unpublish", { method: "POST", body: { kind, locale } }),
  incidents: () => apiFetch<PublicIncident[]>("/admin/status/incidents"),
  openIncident: (input: { title: string; impact: "MINOR" | "MAJOR" | "CRITICAL"; components: string[]; body: string }) => apiFetch<PublicIncident>("/admin/status/incidents", { method: "POST", body: input }),
  updateIncident: (id: string, input: { status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED"; body: string; impact?: "MINOR" | "MAJOR" | "CRITICAL" }) => apiFetch<PublicIncident>(`/admin/status/incidents/${id}/updates`, { method: "POST", body: input }),
  maintenance: () => apiFetch<AdminMaintenance[]>("/admin/status/maintenance"),
  scheduleMaintenance: (input: { title: string; message?: string; startsAt: string; endsAt: string }) => apiFetch<AdminMaintenance>("/admin/status/maintenance", { method: "POST", body: input }),
  cancelMaintenance: (id: string) => apiFetch<AdminMaintenance>(`/admin/status/maintenance/${id}/cancel`, { method: "POST" }),
};
