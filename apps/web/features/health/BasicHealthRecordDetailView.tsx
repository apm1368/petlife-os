"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BasicHealthRecordEditor } from "./BasicHealthRecordEditor";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AllergyDto, ConditionDto, MedicationDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { recordStatusLabel } from "./record-status-labels";
import { statusLabel } from "@/lib/status/status-labels";
import { formatCount } from "@/lib/number/format-number";
import type { RouteLocale } from "@/lib/i18n/config";

type Kind = "condition" | "allergy" | "medication";
type RecordValue = ConditionDto | AllergyDto | MedicationDto;

export function BasicHealthRecordDetailView({ petId, recordId, kind }: { petId: string; recordId: string; kind: Kind }) {
  const router = useRouter();
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("health.recordDetail");
  const healthT = useTranslations("health");
  const [record, setRecord] = useState<RecordValue | null>(null); const [error, setError] = useState(false);
  async function load() { setError(false); try { if (kind === "condition") setRecord(await healthService.getCondition(petId, recordId)); else if (kind === "allergy") setRecord(await healthService.getAllergy(petId, recordId)); else setRecord(await healthService.getMedication(petId, recordId)); } catch { setError(true); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render; the ids are the real inputs.
  useEffect(() => { void load(); }, [petId, recordId, kind]);
  if (error) return <ErrorRecovery title={t("unavailable")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!record) return <Skeleton className="h-72 w-full" aria-label={t("loading")} />;
  const model = present(kind, record, locale, t, healthT);
  return <article className="mx-auto flex max-w-3xl flex-col gap-7">
    <header className="border-b border-border-subtle pb-6"><Link href={"/" + locale + "/pets/" + petId + "/health/" + plural(kind)} className="text-sm font-bold text-brand-natural">{t("back")}</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{model.eyebrow}</p><h1 className="mt-2 text-page-title text-text-primary">{model.title}</h1></div><StatusLabel tone={model.tone}>{model.status}</StatusLabel></div></header>
    <dl className="grid grid-cols-1 border-y border-border-subtle sm:grid-cols-2"><Meta label={t("source")} value={statusLabel(record.sourceType, locale, "source")} /><Meta label={t("recorded")} value={formatDate(model.date, locale)} /></dl>
    <p className="border-s-4 border-s-brand-natural bg-surface-subtle px-4 py-3 text-sm leading-7 text-text-secondary">{record.sourceType === "OWNER" || record.sourceType === "HOUSEHOLD_MEMBER" ? t("ownerNotice") : t("providerNotice")}</p>
    <BasicHealthRecordEditor key={record.id} petId={petId} kind={kind} record={record} onSaved={() => void load()} onDeleted={() => router.push(`/${locale}/pets/${petId}/health/${plural(kind)}`)} />
    {model.fields.map((field) => <ContextSurface key={field.label}><h2 className="text-sm font-bold text-text-primary">{field.label}</h2><p className="mt-2 whitespace-pre-wrap text-body leading-8 text-text-secondary">{field.value}</p></ContextSurface>)}
  </article>;
}

function present(kind: Kind, record: RecordValue, locale: RouteLocale, t: ReturnType<typeof useTranslations>, healthT: ReturnType<typeof useTranslations>) {
  if (kind === "condition") { const item = record as ConditionDto; return { eyebrow: t("condition"), title: item.name, status: recordStatusLabel(item.status, locale), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.firstRecordedAt ?? item.createdAt, fields: compact([{ label: t("notes"), value: item.notes }, { label: t("sourceLabel"), value: item.sourceLabel }]) }; }
  if (kind === "allergy") { const item = record as AllergyDto; return { eyebrow: t("allergy"), title: item.name, status: recordStatusLabel(item.status, locale), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.recordedAt, fields: compact([{ label: t("reaction"), value: item.reaction }, { label: t("severity"), value: item.severity ? healthT(`allergies.severity_${item.severity}`) : null }, { label: t("knowledge"), value: item.knowledgeState ? healthT(`knowledgeState.${item.knowledgeState}`) : null }, { label: t("sourceLabel"), value: item.sourceLabel }]) }; }
  const item = record as MedicationDto; return { eyebrow: t("medication"), title: item.name, status: recordStatusLabel(item.status, locale), tone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, date: item.startDate ?? item.createdAt, fields: compact([{ label: t("dose"), value: item.dosage !== null ? formatCount(item.dosage, locale) + (item.unit ? " " + item.unit : "") : null }, { label: t("frequency"), value: item.frequencyText }, { label: t("route"), value: item.route }, { label: t("instructions"), value: item.instructions }, { label: t("end"), value: item.endDate ? formatDate(item.endDate, locale) : null }]) };
}
function compact(fields: { label: string; value: string | null | undefined }[]) { return fields.filter((field): field is { label: string; value: string } => Boolean(field.value)); }
function Meta({ label, value }: { label: string; value: string }) { return <div className="border-b border-border-subtle px-1 py-4 sm:odd:border-e"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm font-bold text-text-primary">{value}</dd></div>; }
function formatDate(value: string, locale: RouteLocale) { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function plural(kind: Kind) { return kind === "allergy" ? "allergies" : kind === "condition" ? "conditions" : "medications"; }
