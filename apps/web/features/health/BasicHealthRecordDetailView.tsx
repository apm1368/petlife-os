"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AllergyDto, ConditionDto, MedicationDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { recordStatusLabel } from "./record-status-labels";

type Kind = "condition" | "allergy" | "medication";
type RecordValue = ConditionDto | AllergyDto | MedicationDto;

export function BasicHealthRecordDetailView({ petId, recordId, kind }: { petId: string; recordId: string; kind: Kind }) {
  const locale = useLocale() as "fa" | "en"; const fa = locale === "fa";
  const [record, setRecord] = useState<RecordValue | null>(null); const [error, setError] = useState(false);
  async function load() { setError(false); try { if (kind === "condition") setRecord(await healthService.getCondition(petId, recordId)); else if (kind === "allergy") setRecord(await healthService.getAllergy(petId, recordId)); else setRecord(await healthService.getMedication(petId, recordId)); } catch { setError(true); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render; the ids are the real inputs.
  useEffect(() => { void load(); }, [petId, recordId, kind]);
  if (error) return <ErrorRecovery title={fa ? "رکورد در دسترس نیست." : "The record is unavailable."} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!record) return <Skeleton className="h-72 w-full" aria-label={fa ? "بارگذاری رکورد" : "Loading record"} />;
  const model = present(kind, record, fa);
  return <article className="mx-auto flex max-w-3xl flex-col gap-7">
    <header className="border-b border-border-subtle pb-6"><Link href={"/" + locale + "/pets/" + petId + "/health/" + plural(kind)} className="text-sm font-bold text-brand-natural">{fa ? "بازگشت به فهرست" : "Back to list"}</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{model.eyebrow}</p><h1 className="mt-2 text-page-title text-text-primary">{model.title}</h1></div><StatusLabel tone={model.tone}>{model.status}</StatusLabel></div></header>
    <dl className="grid grid-cols-1 border-y border-border-subtle sm:grid-cols-2"><Meta label={fa ? "منبع" : "Source"} value={sourceLabel(record.sourceType, fa)} /><Meta label={fa ? "تاریخ ثبت" : "Recorded"} value={formatDate(model.date, locale)} /></dl>
    <p className="border-s-4 border-s-brand-natural bg-surface-subtle px-4 py-3 text-sm leading-7 text-text-secondary">{record.sourceType === "OWNER" || record.sourceType === "HOUSEHOLD_MEMBER" ? (fa ? "این اطلاعات توسط مالک یا خانواده ثبت شده و جایگزین تشخیص ارائه‌دهنده نیست." : "This information was recorded by the owner or household and does not replace a provider diagnosis.") : (fa ? "این رکورد با منبع ارائه‌دهنده نمایش داده می‌شود و مالک نمی‌تواند حقیقت بالینی آن را بازنویسی کند." : "This record retains provider provenance and cannot be overwritten as owner-authored truth.")}</p>
    {model.fields.map((field) => <ContextSurface key={field.label}><h2 className="text-sm font-bold text-text-primary">{field.label}</h2><p className="mt-2 whitespace-pre-wrap text-body leading-8 text-text-secondary">{field.value}</p></ContextSurface>)}
  </article>;
}

function present(kind: Kind, record: RecordValue, fa: boolean) {
  if (kind === "condition") { const item = record as ConditionDto; return { eyebrow: fa ? "وضعیت سلامت" : "Health condition", title: item.name, status: recordStatusLabel(item.status, fa), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.firstRecordedAt ?? item.createdAt, fields: compact([{ label: fa ? "یادداشت" : "Notes", value: item.notes }, { label: fa ? "برچسب منبع" : "Source label", value: item.sourceLabel }]) }; }
  if (kind === "allergy") { const item = record as AllergyDto; return { eyebrow: fa ? "حساسیت" : "Allergy", title: item.name, status: recordStatusLabel(item.status, fa), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.recordedAt, fields: compact([{ label: fa ? "واکنش" : "Reaction", value: item.reaction }, { label: fa ? "شدت ثبت‌شده" : "Recorded severity", value: item.severity }, { label: fa ? "سطح اطمینان" : "Knowledge state", value: item.knowledgeState }, { label: fa ? "برچسب منبع" : "Source label", value: item.sourceLabel }]) }; }
  const item = record as MedicationDto; return { eyebrow: fa ? "دارو" : "Medication", title: item.name, status: recordStatusLabel(item.status, fa), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.startDate ?? item.createdAt, fields: compact([{ label: fa ? "دوز ثبت‌شده" : "Recorded dose", value: item.dosage !== null ? String(item.dosage) + (item.unit ? " " + item.unit : "") : null }, { label: fa ? "دفعات" : "Frequency", value: item.frequencyText }, { label: fa ? "روش مصرف" : "Route", value: item.route }, { label: fa ? "دستور مصرف" : "Instructions", value: item.instructions }, { label: fa ? "پایان" : "End", value: item.endDate ? formatDate(item.endDate, fa ? "fa" : "en") : null }]) };
}
function compact(fields: { label: string; value: string | null | undefined }[]) { return fields.filter((field): field is { label: string; value: string } => Boolean(field.value)); }
function Meta({ label, value }: { label: string; value: string }) { return <div className="border-b border-border-subtle px-1 py-4 sm:odd:border-e"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm font-bold text-text-primary">{value}</dd></div>; }
function sourceLabel(source: string, fa: boolean) { if (source === "PROVIDER") return fa ? "ارائه‌دهنده" : "Provider"; if (source === "CLINIC") return fa ? "کلینیک" : "Clinic"; return fa ? "مالک/خانواده" : "Owner/household"; }
function formatDate(value: string, locale: "fa" | "en") { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function plural(kind: Kind) { return kind === "allergy" ? "allergies" : kind === "condition" ? "conditions" : "medications"; }
