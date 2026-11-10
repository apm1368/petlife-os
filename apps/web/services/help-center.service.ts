import { apiFetch } from "@/lib/api/client";

export interface HelpCategory { slug: string; title: string; description: string | null; articleCount: number }
export interface HelpArticleSummary { id: string; slug: string; title: string; summary: string | null; excerpt: string; categorySlug: string; isFaq: boolean; publishedAt: string | null }
export interface HelpArticle extends Omit<HelpArticleSummary, "excerpt"> { body: string; contextKeys: string[]; category: { slug: string; title: string }; version: number; updatedAt: string }
export type LegalKind = "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "COOKIE_CONSENT" | "COMMUNITY_GUIDELINES" | "ANIMAL_WELFARE" | "AI_AND_SAFETY" | "PAYMENT_AND_REFUND" | "DELIVERY" | "INSTALLMENT_HELP" | "ACCESSIBILITY";
export interface LegalIndexEntry { kind: LegalKind; available: boolean; title: string | null; effectiveAt: string | null }
export interface LegalDocument { kind: LegalKind; locale: "fa" | "en"; available: boolean; title: string | null; body: string | null; version: number | null; effectiveAt: string | null }
export interface PublicIncident { id: string; title: string; status: string; impact: string; components: string[]; startedAt: string; resolvedAt: string | null; updates: { id: string; status: string; body: string; createdAt: string }[] }
export interface PublicStatus { indicator: string; generatedAt: string; openIncidents: PublicIncident[]; recentIncidents: PublicIncident[]; maintenance: { id: string; title: string; message: string | null; startsAt: string; endsAt: string; active: boolean }[]; activeMaintenance: { title: string; message: string | null; endsAt: string } | null }

// Existing editorial source selection: these public clients read fa/en editions.
// UI localization is independent; do not claim de/es article/legal translations
// or silently machine-translate approved bodies. Public views disclose originals.
const localeParam = (locale: string) => `locale=${locale === "fa" ? "fa" : "en"}`;

export const helpCenterService = {
  categories: (locale: string, signal?: AbortSignal) => apiFetch<HelpCategory[]>(`/help/categories?${localeParam(locale)}`, { signal }),
  articles: (locale: string, options: { category?: string; faq?: boolean } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams({ locale: locale === "fa" ? "fa" : "en" });
    if (options.category) query.set("category", options.category);
    if (options.faq) query.set("faq", "true");
    return apiFetch<HelpArticleSummary[]>(`/help/articles?${query}`, { signal });
  },
  search: (locale: string, q: string, signal?: AbortSignal) => apiFetch<HelpArticleSummary[]>(`/help/search?${localeParam(locale)}&q=${encodeURIComponent(q)}`, { signal }),
  article: (locale: string, slug: string, signal?: AbortSignal) => apiFetch<HelpArticle>(`/help/articles/${encodeURIComponent(slug)}?${localeParam(locale)}`, { signal }),
  vote: (locale: string, slug: string, helpful: boolean) => apiFetch<{ ok: true }>(`/help/articles/${encodeURIComponent(slug)}/vote?${localeParam(locale)}`, { method: "POST", body: { helpful } }),
  legalIndex: (locale: string, signal?: AbortSignal) => apiFetch<LegalIndexEntry[]>(`/legal?${localeParam(locale)}`, { signal }),
  legalDocument: (locale: string, slug: string, signal?: AbortSignal) => apiFetch<LegalDocument>(`/legal/${encodeURIComponent(slug)}?${localeParam(locale)}`, { signal }),
  status: (signal?: AbortSignal) => apiFetch<PublicStatus>("/status", { signal }),
  incident: (id: string, signal?: AbortSignal) => apiFetch<PublicIncident>(`/status/incidents/${encodeURIComponent(id)}`, { signal }),
};
