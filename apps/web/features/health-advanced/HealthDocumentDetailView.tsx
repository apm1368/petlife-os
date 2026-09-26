"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { MedicalDocumentDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";

export function HealthDocumentDetailView({ petId, documentId }: { petId: string; documentId: string }) {
  const locale = useLocale() as "fa" | "en"; const fa = locale === "fa";
  const [document, setDocument] = useState<MedicalDocumentDto | null>(null); const [error, setError] = useState(false); const [downloading, setDownloading] = useState(false);
  async function load() { setError(false); try { setDocument(await healthAdvancedService.getDocument(petId, documentId)); } catch { setError(true); } }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [petId, documentId]);
  async function download() { setDownloading(true); try { const target = await healthAdvancedService.downloadDocument(petId, documentId); window.open(target.downloadUrl, "_blank", "noopener,noreferrer"); } finally { setDownloading(false); } }
  if (error) return <ErrorRecovery title={fa ? "سند در دسترس نیست." : "The document is unavailable."} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!document) return <Skeleton className="h-72 w-full" aria-label={fa ? "بارگذاری سند" : "Loading document"} />;
  return <article className="mx-auto flex max-w-3xl flex-col gap-7"><header className="border-b border-border-subtle pb-6"><Link href={"/" + locale + "/pets/" + petId + "/health/advanced/documents"} className="text-sm font-bold text-brand-natural">{fa ? "بازگشت به اسناد" : "Back to documents"}</Link><div className="mt-5 flex flex-wrap justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{document.documentType}</p><h1 className="mt-2 text-page-title text-text-primary">{document.title}</h1></div><StatusLabel tone={document.verificationStatus === "PROVIDER_VERIFIED" ? "success" : "neutral"}>{document.verificationStatus}</StatusLabel></div></header><ContextSurface><dl className="grid grid-cols-1 gap-5 sm:grid-cols-2"><Meta label={fa ? "منبع" : "Source"} value={document.source.providerOrganizationName ?? (fa ? "مالک/خانواده" : "Owner/household")} /><Meta label={fa ? "تاریخ رکورد" : "Record date"} value={formatDate(document.recordedAt ?? document.uploadedAt, locale)} /><Meta label={fa ? "نوع فایل" : "File type"} value={document.mimeType} /><Meta label={fa ? "حریم خصوصی" : "Privacy"} value={document.visibility} /></dl>{document.description ? <p className="mt-6 border-t border-border-subtle pt-5 text-body leading-8 text-text-secondary">{document.description}</p> : null}</ContextSurface><p className="text-sm leading-7 text-text-secondary">{fa ? "فایل خصوصی است و لینک عمومی ندارد. هر بار دانلود، دسترسی کوتاه‌عمر و امضاشده ساخته می‌شود." : "This file is private and has no public object URL. Every download mints a short-lived signed access link."}</p><Button variant="primary" isLoading={downloading} onClick={download}>{fa ? "دانلود امن" : "Secure download"}</Button></article>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm font-bold text-text-primary">{value}</dd></div>; }
function formatDate(value: string, locale: "fa" | "en") { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
