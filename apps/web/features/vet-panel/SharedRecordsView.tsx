"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { MedicalDocumentDownloadDto } from "@petlife/types";
import { ApiError, apiFetch } from "@/lib/api/client";

type ReceivedShare = { id: string; pet: { id: string; name: string; species: string }; scopes: string[]; documentCount: number; startsAt: string; expiresAt: string };
type Named = { id: string; name: string };
type SharedRecord = { petId: string; scopes: string[]; conditions?: (Named & { status?: string })[]; allergies?: (Named & { severity?: string | null })[]; medications?: (Named & { dosage?: string | null })[]; vaccination?: { status: string; lastKnownDate?: string | null; nextDueDate?: string | null } | null; documents?: { id: string; title: string; documentType: string }[]; visits?: { id: string; reasonForVisit: string | null; providerOrganizationName: string; startedAt?: string }[] };

const SCOPES: Record<string, [string, string]> = { CONDITIONS: ["بیماری‌های ثبت‌شده", "Recorded conditions"], ALLERGIES: ["آلرژی‌ها", "Allergies"], CURRENT_MEDICATIONS: ["داروهای فعال", "Current medications"], VACCINATION_SUMMARY: ["خلاصه واکسیناسیون", "Vaccination summary"], SELECTED_DOCUMENTS: ["اسناد انتخاب‌شده", "Selected documents"], CLINICAL_HISTORY: ["ویزیت‌های بالینی", "Clinical visits"] };

function useFormat() {
  const fa = useLocale() === "fa";
  return (date: string) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(date));
}

/** Recipient side of Share With Vet: only active, unexpired, unrevoked explicit shares are listed by the API. */
export function SharedRecordsInboxView() {
  const locale = useLocale(); const fa = locale === "fa"; const ix = fa ? 0 : 1; const format = useFormat();
  const [shares, setShares] = useState<ReceivedShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { setShares(await apiFetch<ReceivedShare[]>("/vet-shares/received")); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load"); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorRecovery title={fa ? "پرونده‌های اشتراکی در دسترس نیست" : "Shared records unavailable"} message={error} retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!shares) return <Skeleton className="h-64 w-full" />;
  return <div className="flex flex-col gap-6">
    <header><h1 className="text-page-title">{fa ? "پرونده‌های اشتراکی" : "Shared records"}</h1><p className="mt-2 text-sm text-text-secondary">{fa ? "فقط بخش‌هایی که صاحب حیوان انتخاب کرده و تا زمان انقضا یا لغو." : "Only the sections the owner chose, until expiry or revocation."}</p></header>
    {!shares.length ? <EmptyState title={fa ? "پرونده فعالی با شما به اشتراک گذاشته نشده" : "No active shares with you"} /> : shares.map(share => <ContextSurface key={share.id} className="flex flex-col gap-3">
      <Link className="text-section-title text-text-primary" href={`/${locale}/provider/shared-records/${share.pet.id}/${share.id}`}>{share.pet.name}</Link>
      <p className="text-sm">{share.scopes.map(scope => SCOPES[scope]?.[ix] ?? scope).join(" · ")}</p>
      <p className="text-sm text-text-secondary">{fa ? "اعتبار" : "Valid"}: {format(share.startsAt)} — {format(share.expiresAt)}</p>
    </ContextSurface>)}
  </div>;
}

export function SharedRecordDetailView({ petId, shareId }: { petId: string; shareId: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const ix = fa ? 0 : 1; const format = useFormat();
  const [record, setRecord] = useState<SharedRecord | null>(null);
  const [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const base = `/shared-pets/${petId}/vet-shares/${shareId}`;
  const load = useCallback(async () => { setError(null); try { setRecord(await apiFetch<SharedRecord>(base)); } catch (e) { setError({ message: e instanceof Error ? e.message : "Unable to load", denied: e instanceof ApiError && (e.status === 403 || e.status === 404) }); } }, [base]);
  useEffect(() => { void load(); }, [load]);
  async function download(documentId: string) {
    setDownloadError(null);
    try { const target = await apiFetch<MedicalDocumentDownloadDto>(`${base}/documents/${documentId}/download`); window.open(target.downloadUrl, "_blank", "noopener,noreferrer"); }
    catch (e) { setDownloadError(e instanceof Error ? e.message : "Download denied"); }
  }
  const back = <Link className="text-brand-natural" href={`/${locale}/provider/shared-records`}>{fa ? "بازگشت به پرونده‌های اشتراکی" : "Back to shared records"}</Link>;
  if (error?.denied) return <div className="flex flex-col gap-4"><EmptyState title={fa ? "این اشتراک دیگر فعال نیست" : "This share is no longer active"} description={fa ? "دسترسی منقضی یا توسط صاحب حیوان لغو شده است." : "Access has expired or was revoked by the owner."} />{back}</div>;
  if (error) return <ErrorRecovery title={fa ? "پرونده در دسترس نیست" : "Record unavailable"} message={error.message} retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!record) return <Skeleton className="h-72 w-full" />;
  const list = (items: string[] | undefined) => items?.length ? <ul className="mt-2 list-inside list-disc text-sm">{items.map((item, i) => <li key={i} dir="auto">{item}</li>)}</ul> : <p className="mt-2 text-sm text-text-secondary">{fa ? "رکوردی ثبت نشده" : "No record stored"}</p>;
  return <div className="flex flex-col gap-6">
    {back}
    <h1 className="text-page-title">{fa ? "پرونده اشتراکی" : "Shared record"}</h1>
    <p className="text-sm text-text-secondary">{fa ? "فقط خواندنی؛ هر بخش همان محدوده‌ای است که صاحب حیوان تأیید کرده است." : "Read-only; each section is exactly the scope the owner confirmed."}</p>
    {record.scopes.includes("CONDITIONS") ? <ContextSurface><h2 className="font-bold">{SCOPES.CONDITIONS![ix]}</h2>{list(record.conditions?.map(c => c.name))}</ContextSurface> : null}
    {record.scopes.includes("ALLERGIES") ? <ContextSurface><h2 className="font-bold">{SCOPES.ALLERGIES![ix]}</h2>{list(record.allergies?.map(a => a.severity ? `${a.name} · ${a.severity}` : a.name))}</ContextSurface> : null}
    {record.scopes.includes("CURRENT_MEDICATIONS") ? <ContextSurface><h2 className="font-bold">{SCOPES.CURRENT_MEDICATIONS![ix]}</h2>{list(record.medications?.map(m => m.dosage ? `${m.name} — ${m.dosage}` : m.name))}</ContextSurface> : null}
    {record.scopes.includes("VACCINATION_SUMMARY") ? <ContextSurface><h2 className="font-bold">{SCOPES.VACCINATION_SUMMARY![ix]}</h2>{record.vaccination ? <p className="mt-2 text-sm">{record.vaccination.status}{record.vaccination.nextDueDate ? ` · ${fa ? "نوبت بعد" : "Next due"}: ${format(record.vaccination.nextDueDate)}` : ""}</p> : list([])}</ContextSurface> : null}
    {record.scopes.includes("CLINICAL_HISTORY") ? <ContextSurface><h2 className="font-bold">{SCOPES.CLINICAL_HISTORY![ix]}</h2>{list(record.visits?.map(v => [v.startedAt ? format(v.startedAt) : null, v.providerOrganizationName, v.reasonForVisit].filter(Boolean).join(" · ")))}</ContextSurface> : null}
    {record.scopes.includes("SELECTED_DOCUMENTS") ? <ContextSurface className="flex flex-col gap-3"><h2 className="font-bold">{SCOPES.SELECTED_DOCUMENTS![ix]}</h2>{record.documents?.length ? record.documents.map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-3"><span dir="auto">{d.title}</span><Button variant="secondary" onClick={() => void download(d.id)}>{fa ? "دریافت امن" : "Secure download"}</Button></div>) : list([])}{downloadError ? <p role="alert" className="text-state-urgent">{downloadError}</p> : null}</ContextSurface> : null}
  </div>;
}
