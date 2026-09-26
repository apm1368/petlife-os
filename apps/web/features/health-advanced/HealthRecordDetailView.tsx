"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type {
  ClinicalNutritionPlanDto,
  DentalRecordDto,
  ImagingStudyDto,
  LabResultDto,
  ReferralDto,
  RehabPlanDto,
} from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";

type RecordKind = "lab" | "imaging" | "referral" | "dental" | "nutrition" | "rehab";
type RecordValue = LabResultDto | ImagingStudyDto | ReferralDto | DentalRecordDto | ClinicalNutritionPlanDto | RehabPlanDto;

const copy = {
  fa: { back: "بازگشت به فهرست", source: "منبع", provider: "ارائه‌دهنده", date: "تاریخ", status: "وضعیت", relatedVisit: "ویزیت مرتبط", unknown: "ثبت نشده", owner: "ثبت مالک/خانواده", clinical: "رکورد بالینی", loadError: "رکورد سلامت در دسترس نیست.", retry: "تلاش دوباره", loading: "در حال بارگذاری رکورد", noInterpretation: "پت‌لایف این نتیجه را تفسیر پزشکی نمی‌کند؛ فقط داده و پرچم ثبت‌شده توسط منبع نمایش داده می‌شود." },
  en: { back: "Back to list", source: "Source", provider: "Provider", date: "Date", status: "Status", relatedVisit: "Related visit", unknown: "Not recorded", owner: "Owner/household record", clinical: "Clinical record", loadError: "The health record is unavailable.", retry: "Try again", loading: "Loading health record", noInterpretation: "PET LIFE does not medically interpret this result; only source data and source-provided flags are shown." },
} as const;

export function HealthRecordDetailView({ petId, recordId, kind }: { petId: string; recordId: string; kind: RecordKind }) {
  const locale = useLocale() as "fa" | "en";
  const c = copy[locale];
  const [record, setRecord] = useState<RecordValue | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      if (kind === "lab") setRecord(await healthAdvancedService.getLab(petId, recordId));
      else if (kind === "imaging") setRecord(await healthAdvancedService.getImaging(petId, recordId));
      else if (kind === "referral") setRecord(await healthAdvancedService.getReferral(petId, recordId));
      else if (kind === "dental") setRecord(await healthAdvancedService.getDental(petId, recordId));
      else if (kind === "nutrition") setRecord(await healthAdvancedService.getNutrition(petId, recordId));
      else setRecord(await healthAdvancedService.getRehab(petId, recordId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, recordId, kind]);

  if (error) return <ErrorRecovery title={c.loadError} message="" retryLabel={c.retry} onRetry={load} />;
  if (!record) return <Skeleton className="h-72 w-full" aria-label={c.loading} />;

  const model = presentRecord(kind, record, locale, c.unknown);
  const base = "/" + locale + "/pets/" + petId + "/health/advanced";

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-7">
      <header className="border-b border-border-subtle pb-6">
        <Link href={base + "/" + listSlug(kind)} className="text-sm font-bold text-brand-natural">{c.back}</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{model.eyebrow}</p><h1 className="mt-2 text-page-title text-text-primary">{model.title}</h1></div>
          {model.status ? <StatusLabel tone={model.statusTone}>{model.status}</StatusLabel> : null}
        </div>
        {model.subtitle ? <p className="mt-3 text-body leading-8 text-text-secondary">{model.subtitle}</p> : null}
      </header>

      {kind === "lab" ? <p className="border-s-4 border-s-brand-natural bg-surface-subtle px-4 py-3 text-sm leading-7 text-text-secondary">{c.noInterpretation}</p> : null}

      <dl className="grid grid-cols-1 border-y border-border-subtle sm:grid-cols-2">
        <Meta label={c.date} value={model.date ? formatDate(model.date, locale) : c.unknown} />
        <Meta label={c.source} value={model.sourceLabel} />
        <Meta label={c.provider} value={model.provider ?? c.unknown} />
        <Meta label={c.status} value={model.status ?? c.unknown} />
      </dl>

      <section className="flex flex-col gap-5">
        {model.fields.map((field) => <ContextSurface key={field.label}><h2 className="text-sm font-bold text-text-primary">{field.label}</h2><p className="mt-2 whitespace-pre-wrap text-body leading-8 text-text-secondary">{field.value}</p></ContextSurface>)}
      </section>

      {model.visitId ? <Link className="border-t border-border-subtle pt-5 text-sm font-bold text-brand-natural" href={base + "/visits/" + model.visitId}>{c.relatedVisit}</Link> : null}
    </article>
  );
}

function presentRecord(kind: RecordKind, record: RecordValue, locale: "fa" | "en", unknown: string) {
  const fa = locale === "fa";
  if (kind === "lab") {
    const item = record as LabResultDto;
    const range = item.referenceRangeLow !== null || item.referenceRangeHigh !== null ? String(item.referenceRangeLow ?? "—") + " – " + String(item.referenceRangeHigh ?? "—") : unknown;
    return { eyebrow: fa ? "نتیجه آزمایش" : "Lab result", title: item.testName, subtitle: item.testCode, date: item.resultDate ?? item.sampleDate ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: item.flag ?? item.status, statusTone: item.flag === "ABNORMAL" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "نتیجه" : "Result", value: item.value ? item.value + (item.unit ? " " + item.unit : "") : item.qualitativeResult }, { label: fa ? "بازه مرجع ثبت‌شده" : "Recorded reference range", value: range }, { label: fa ? "یادداشت منبع" : "Source notes", value: item.notes }]) };
  }
  if (kind === "imaging") {
    const item = record as ImagingStudyDto;
    return { eyebrow: fa ? "تصویربرداری" : "Imaging study", title: item.studyType, subtitle: item.bodyRegion, date: item.performedAt ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: item.voidedAt ? (fa ? "باطل‌شده" : "Voided") : (fa ? "ثبت‌شده" : "Recorded"), statusTone: item.voidedAt ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "گزارش" : "Report", value: item.report }, { label: fa ? "یافته‌ها" : "Findings", value: item.findings }, { label: fa ? "توصیه منبع" : "Source recommendation", value: item.recommendation }]) };
  }
  if (kind === "referral") {
    const item = record as ReferralDto;
    return { eyebrow: fa ? "ارجاع پزشکی" : "Clinical referral", title: item.reason, subtitle: item.toProviderOrganizationName ?? item.externalProviderName, date: item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.fromProviderOrganizationName, status: item.status, statusTone: item.status === "COMPLETED" ? "success" as const : "attention" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "تخصص مقصد" : "Destination specialty", value: item.externalSpecialty }, { label: fa ? "یادداشت" : "Notes", value: item.notes }]) };
  }
  if (kind === "dental") {
    const item = record as DentalRecordDto;
    return { eyebrow: fa ? "پرونده دندان‌پزشکی" : "Dental record", title: item.recordType, subtitle: null, date: item.performedAt ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: item.followUpRecommended ? (fa ? "نیازمند پیگیری" : "Follow-up recommended") : null, statusTone: item.followUpRecommended ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "یافته‌ها" : "Findings", value: item.findings }, { label: fa ? "یادداشت" : "Notes", value: item.notes }, { label: fa ? "توصیه پیگیری" : "Follow-up", value: item.followUpNotes }]) };
  }
  if (kind === "nutrition") {
    const item = record as ClinicalNutritionPlanDto;
    return { eyebrow: fa ? "برنامه تغذیه بالینی" : "Clinical nutrition plan", title: item.goal ?? (fa ? "برنامه تغذیه" : "Nutrition plan"), subtitle: item.dietType, date: item.startDate ?? item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.source.providerOrganizationName, status: item.status, statusTone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "غذای توصیه‌شده" : "Recommended food", value: item.recommendedFoodText }, { label: fa ? "مقدار روزانه" : "Daily amount", value: item.dailyAmountText }, { label: fa ? "دفعات" : "Frequency", value: item.frequencyText }, { label: fa ? "محدودیت‌ها" : "Restrictions", value: item.restrictionsText }, { label: fa ? "یادداشت" : "Notes", value: item.notes }]) };
  }
  const item = record as RehabPlanDto;
  return { eyebrow: fa ? "برنامه توان‌بخشی" : "Rehabilitation plan", title: item.goal ?? (fa ? "توان‌بخشی" : "Rehabilitation"), subtitle: null, date: item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.source.providerOrganizationName, status: item.status, statusTone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "تمرین‌ها" : "Exercises", value: item.exercisesText }, { label: fa ? "دفعات" : "Frequency", value: item.frequencyText }, { label: fa ? "مدت" : "Duration", value: item.durationText }, { label: fa ? "جلسات ثبت‌شده" : "Recorded sessions", value: item.sessions.map((session) => formatDate(session.sessionDate, locale) + (session.progressNotes ? " — " + session.progressNotes : "")).join("\n") }]) };
}

function compact(fields: { label: string; value: string | null | undefined }[]) {
  return fields.filter((field): field is { label: string; value: string } => Boolean(field.value));
}
function Meta({ label, value }: { label: string; value: string }) { return <div className="border-b border-border-subtle px-1 py-4 sm:odd:border-e"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm font-bold text-text-primary">{value}</dd></div>; }
function source(value: string, fa: boolean) { return value === "PROVIDER" || value === "CLINIC" ? (fa ? "ارائه‌دهنده" : "Provider") : (fa ? "مالک/خانواده" : "Owner/household"); }
function formatDate(value: string, locale: "fa" | "en") { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function listSlug(kind: RecordKind) { return kind === "lab" ? "labs" : kind; }
