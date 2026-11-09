"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { MedicalDocumentDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { DocumentRecordActions } from "./DocumentRecordActions";
import { documentTypeLabel, documentVerificationLabel, documentVisibilityLabel } from "./document-labels";
import type { RouteLocale } from "@/lib/i18n/config";

export function HealthDocumentDetailView({ petId, documentId }: { petId: string; documentId: string }) {
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("healthAdvanced.documents");
  const [document, setDocument] = useState<MedicalDocumentDto | null>(null); const [error, setError] = useState(false); const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; expiresAt: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => { if (!preview) return; const timer = setTimeout(() => setPreview(null), Math.max(0, preview.expiresAt - Date.now())); return () => clearTimeout(timer); }, [preview]);
  const load = useCallback(async () => { setError(false); setPreview(null); try { setDocument(await healthAdvancedService.getDocument(petId, documentId)); } catch { setError(true); } }, [petId, documentId]);
  useEffect(() => { void load(); }, [load]);
  async function download() { setDownloading(true); setFileError(null); try { const target = await healthAdvancedService.downloadDocument(petId, documentId); setPreview({ url: target.downloadUrl, expiresAt: Date.now() + target.expiresInSeconds * 1000 }); } catch { setFileError(t("downloadFailed")); } finally { setDownloading(false); } }
  if (error) return <ErrorRecovery title={t("unavailable")} message={t("unavailableMessage")} retryLabel={t("retry")} onRetry={load} />;
  if (!document) return <Skeleton className="h-72 w-full" aria-label={t("loading")} />;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private medical file must not pass through the Next image optimizer cache
  return <><article className="mx-auto flex max-w-3xl flex-col gap-7"><header className="border-b border-border-subtle pb-6"><Link href={`/${locale}/pets/${petId}/health/advanced/documents`} className="text-sm font-bold text-brand-natural">{t("back")}</Link><div className="mt-5 flex flex-wrap justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{documentTypeLabel(document.documentType, locale)}</p><h1 className="mt-2 text-page-title text-text-primary">{document.title}</h1></div><StatusLabel tone={document.verificationStatus === "PROVIDER_VERIFIED" ? "success" : "neutral"}>{documentVerificationLabel(document.verificationStatus, locale)}</StatusLabel></div></header><ContextSurface><dl className="grid grid-cols-1 gap-5 sm:grid-cols-2"><Meta label={t("source")} value={document.source.providerOrganizationName ?? t("ownerSource")} /><Meta label={t("recordDate")} value={formatDate(document.recordedAt ?? document.uploadedAt, locale)} /><Meta label={t("fileType")} value={document.mimeType} /><Meta label={t("privacy")} value={documentVisibilityLabel(document.visibility, locale)} /></dl>{document.description ? <p className="mt-6 border-t border-border-subtle pt-5 text-body leading-8 text-text-secondary">{document.description}</p> : null}</ContextSurface><p className="text-sm leading-7 text-text-secondary">{t("privateNotice")}</p><Button variant="primary" isLoading={downloading} onClick={download}>{t("previewDownload")}</Button><DocumentRecordActions key={document.id} petId={petId} document={document} onSaved={load} /></article>{fileError ? <p role="alert" className="text-state-urgent">{fileError}</p> : null}{preview ? <section className="mt-5 flex flex-col gap-4"><a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-brand-natural">{t("openFile")}</a>{document.mimeType === "application/pdf" ? <iframe title={document.title} src={preview.url} sandbox="" className="h-[65vh] w-full rounded border" /> : ["image/jpeg", "image/png", "image/webp"].includes(document.mimeType) ? <img src={preview.url} alt={document.title} className="max-h-[65vh] object-contain" /> : <p>{t("previewUnavailable")}</p>}</section> : null}</>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm font-bold text-text-primary">{value}</dd></div>; }
function formatDate(value: string, locale: RouteLocale) { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
