"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ClinicalVisitDetailDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";

export function ClinicalVisitDetailView({ petId, visitId }: { petId: string; visitId: string }) {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [visit, setVisit] = useState<ClinicalVisitDetailDto | null>(null);
  const [error, setError] = useState(false);
  async function load() { setError(false); try { setVisit(await healthAdvancedService.getVisit(petId, visitId)); } catch { setError(true); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render; the ids are the real inputs.
  useEffect(() => { void load(); }, [petId, visitId]);
  if (error) return <ErrorRecovery title={fa ? "ویزیت در دسترس نیست." : "The visit is unavailable."} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!visit) return <Skeleton className="h-80 w-full" aria-label={fa ? "بارگذاری ویزیت" : "Loading visit"} />;
  const fields = [{ label: fa ? "سابقه" : "History", value: visit.historyText }, { label: fa ? "یافته‌ها و مشاهدات" : "Findings and observations", value: visit.observationsText }, { label: fa ? "ارزیابی" : "Assessment", value: visit.assessmentText }, { label: fa ? "برنامه" : "Plan", value: visit.planText }].filter((field) => field.value);
  return <article className="mx-auto flex max-w-3xl flex-col gap-7">
    <header className="border-b border-border-subtle pb-6"><Link href={"/" + locale + "/pets/" + petId + "/health/advanced/visits"} className="text-sm font-bold text-brand-natural">{fa ? "بازگشت به ویزیت‌ها" : "Back to visits"}</Link><div className="mt-5 flex flex-wrap justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{fa ? "رویداد پزشکی، جدا از رزرو" : "Medical event, separate from booking"}</p><h1 className="mt-2 text-page-title text-text-primary">{visit.reasonForVisit ?? (fa ? "ویزیت بالینی" : "Clinical visit")}</h1><p className="mt-2 text-sm text-text-secondary">{visit.providerOrganizationName} · {formatDate(visit.startedAt, locale)}</p></div><StatusLabel tone={visit.status === "COMPLETED" || visit.status === "AMENDED" ? "success" : "neutral"}>{visit.status}</StatusLabel></div></header>
    {fields.map((field) => <ContextSurface key={field.label}><h2 className="text-sm font-bold text-text-primary">{field.label}</h2><p className="mt-2 whitespace-pre-wrap text-body leading-8 text-text-secondary">{field.value}</p></ContextSurface>)}
    {visit.revisions.length > 0 ? <section className="border-t border-border-subtle pt-6"><h2 className="text-section-title text-text-primary">{fa ? "تاریخچه اصلاحات" : "Correction history"}</h2><div className="mt-4 divide-y divide-border-subtle">{visit.revisions.map((revision) => <div key={revision.id} className="py-4"><p className="font-bold text-text-primary">{fa ? "اصلاحیه" : "Revision"} {revision.revisionNumber}</p><p className="mt-1 text-sm text-text-secondary">{revision.reason} · {formatDate(revision.createdAt, locale)}</p></div>)}</div></section> : null}
  </article>;
}
function formatDate(value: string, locale: "fa" | "en") { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
