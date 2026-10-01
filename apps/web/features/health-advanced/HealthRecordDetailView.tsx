"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type {
  ClinicalNutritionPlanDto,
  DentalRecordDto,
  ImagingStudyDto,
  LabResultDto,
  ReferralDto,
  RehabPlanDto,
} from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { localizeDigits } from "@/lib/date/jalali";
import { recordStatusLabel } from "@/features/health/record-status-labels";

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

  const isLab = kind === "lab";
  const labFields = new Set(locale === "fa" ? ["نتیجه", "بازه مرجع ثبت‌شده"] : ["Result", "Recorded reference range"]);
  const fields = isLab ? model.fields.filter((field) => !labFields.has(field.label)) : model.fields;

  return (
    <article className="record-detail">
      <header className="section-head">
        <div>
          <Link href={base + "/" + listSlug(kind)} className="record-detail__back">{c.back}</Link>
          <p className="record-detail__eyebrow">{model.eyebrow}</p>
          <h1>{model.title}</h1>
          {model.subtitle ? <p>{model.subtitle}</p> : null}
        </div>
        {model.status ? <StatusLabel tone={model.statusTone}>{model.status}</StatusLabel> : null}
      </header>

      <div className="split-layout">
        <div className="split-main">
          {isLab ? <LabResultBand item={record as LabResultDto} locale={locale} /> : null}
          {isLab ? <p className="calm-note text-sm leading-7">{c.noInterpretation}</p> : null}
          {fields.map((field) => (
            <section key={field.label} className="split-section">
              <h2 className="text-sm font-bold text-text-primary">{field.label}</h2>
              <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-body leading-8 text-text-secondary">{field.value}</p>
            </section>
          ))}
          {model.visitId ? <Link className="split-section text-sm font-bold text-brand-natural" href={base + "/visits/" + model.visitId}>{c.relatedVisit}</Link> : null}
        </div>
        <aside className="split-aside">
          <section className="split-panel" aria-label={c.source}>
            <dl className="record-provenance">
              <Meta label={c.date} value={model.date ? formatDate(model.date, locale) : c.unknown} />
              <Meta label={c.source} value={model.sourceLabel} />
              <Meta label={c.provider} value={model.provider ?? c.unknown} />
              <Meta label={c.status} value={model.status ?? c.unknown} />
            </dl>
          </section>
        </aside>
      </div>
    </article>
  );
}

/**
 * The recorded result, large and unambiguous: value and unit, the source's own reference range, and a bar
 * that places the value against that range. No interpretation is added — the bar only plots recorded numbers
 * and the flag is the source's. Digits follow the UI language; the decimal point, unit and range order are
 * kept as recorded, inside a direction-isolated span so a range can never visually flip in RTL.
 */
function LabResultBand({ item, locale }: { item: LabResultDto; locale: "fa" | "en" }) {
  const fa = locale === "fa";
  const digits = (v: string | number) => localizeDigits(v, fa ? "fa" : "en");
  const value = item.value !== null && item.value !== undefined ? Number(item.value) : NaN;
  const low = item.referenceRangeLow !== null && item.referenceRangeLow !== undefined ? Number(item.referenceRangeLow) : NaN;
  const high = item.referenceRangeHigh !== null && item.referenceRangeHigh !== undefined ? Number(item.referenceRangeHigh) : NaN;
  const plottable = [value, low, high].every(Number.isFinite) && high > low;
  // The range occupies the middle 60% of the track; values outside it fall into the margins (clamped).
  const position = plottable ? Math.min(100, Math.max(0, 20 + ((value - low) / (high - low)) * 60)) : 0;
  const flagged = item.flag === "ABNORMAL";
  return (
    <section className="lab-band" data-flagged={flagged || undefined}>
      <div className="lab-band__value">
        <span className="lab-band__label">{fa ? "نتیجه" : "Result"}</span>
        <strong><bdi>{item.value !== null && item.value !== undefined ? digits(item.value) : item.qualitativeResult ?? (fa ? "ثبت نشده" : "Not recorded")}</bdi>{item.unit ? <span className="lab-band__unit"> {item.unit}</span> : null}</strong>
      </div>
      <div className="lab-band__range">
        <span className="lab-band__label">{fa ? "بازهٔ مرجع ثبت‌شده" : "Recorded reference range"}</span>
        <span><bdi>{Number.isFinite(low) || Number.isFinite(high) ? `${Number.isFinite(low) ? digits(item.referenceRangeLow!) : "—"} – ${Number.isFinite(high) ? digits(item.referenceRangeHigh!) : "—"}` : (fa ? "ثبت نشده" : "Not recorded")}</bdi></span>
      </div>
      {plottable ? (
        <div className="lab-band__track" role="img" aria-label={fa ? `مقدار ${digits(item.value!)} در برابر بازهٔ ${digits(item.referenceRangeLow!)} تا ${digits(item.referenceRangeHigh!)}` : `Value ${item.value} against the range ${item.referenceRangeLow} to ${item.referenceRangeHigh}`}>
          <span className="lab-band__range-fill" />
          <span className="lab-band__marker" style={{ insetInlineStart: `${position}%` }} />
        </div>
      ) : null}
    </section>
  );
}

function presentRecord(kind: RecordKind, record: RecordValue, locale: "fa" | "en", unknown: string) {
  const fa = locale === "fa";
  if (kind === "lab") {
    const item = record as LabResultDto;
    const digits = (v: string | number) => localizeDigits(v, fa ? "fa" : "en");
    const range = item.referenceRangeLow !== null || item.referenceRangeHigh !== null ? digits(item.referenceRangeLow ?? "—") + " – " + digits(item.referenceRangeHigh ?? "—") : unknown;
    return { eyebrow: fa ? "نتیجه آزمایش" : "Lab result", title: item.testName, subtitle: item.testCode, date: item.resultDate ?? item.sampleDate ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: recordStatusLabel(item.flag ?? item.status, fa), statusTone: item.flag === "ABNORMAL" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "نتیجه" : "Result", value: item.value ? digits(item.value) + (item.unit ? " " + item.unit : "") : item.qualitativeResult }, { label: fa ? "بازه مرجع ثبت‌شده" : "Recorded reference range", value: range }, { label: fa ? "یادداشت منبع" : "Source notes", value: item.notes }]) };
  }
  if (kind === "imaging") {
    const item = record as ImagingStudyDto;
    return { eyebrow: fa ? "تصویربرداری" : "Imaging study", title: item.studyType, subtitle: item.bodyRegion, date: item.performedAt ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: item.voidedAt ? (fa ? "باطل‌شده" : "Voided") : (fa ? "ثبت‌شده" : "Recorded"), statusTone: item.voidedAt ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "گزارش" : "Report", value: item.report }, { label: fa ? "یافته‌ها" : "Findings", value: item.findings }, { label: fa ? "توصیه منبع" : "Source recommendation", value: item.recommendation }]) };
  }
  if (kind === "referral") {
    const item = record as ReferralDto;
    return { eyebrow: fa ? "ارجاع پزشکی" : "Clinical referral", title: item.reason, subtitle: item.toProviderOrganizationName ?? item.externalProviderName, date: item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.fromProviderOrganizationName, status: recordStatusLabel(item.status, fa), statusTone: item.status === "COMPLETED" ? "success" as const : "attention" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "تخصص مقصد" : "Destination specialty", value: item.externalSpecialty }, { label: fa ? "یادداشت" : "Notes", value: item.notes }]) };
  }
  if (kind === "dental") {
    const item = record as DentalRecordDto;
    return { eyebrow: fa ? "پرونده دندان‌پزشکی" : "Dental record", title: item.recordType, subtitle: null, date: item.performedAt ?? item.createdAt, sourceLabel: source(item.sourceType, fa), provider: item.source.providerOrganizationName, status: item.followUpRecommended ? (fa ? "نیازمند پیگیری" : "Follow-up recommended") : null, statusTone: item.followUpRecommended ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "یافته‌ها" : "Findings", value: item.findings }, { label: fa ? "یادداشت" : "Notes", value: item.notes }, { label: fa ? "توصیه پیگیری" : "Follow-up", value: item.followUpNotes }]) };
  }
  if (kind === "nutrition") {
    const item = record as ClinicalNutritionPlanDto;
    return { eyebrow: fa ? "برنامه تغذیه بالینی" : "Clinical nutrition plan", title: item.goal ?? (fa ? "برنامه تغذیه" : "Nutrition plan"), subtitle: item.dietType, date: item.startDate ?? item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.source.providerOrganizationName, status: recordStatusLabel(item.status, fa), statusTone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "غذای توصیه‌شده" : "Recommended food", value: item.recommendedFoodText }, { label: fa ? "مقدار روزانه" : "Daily amount", value: item.dailyAmountText }, { label: fa ? "دفعات" : "Frequency", value: item.frequencyText }, { label: fa ? "محدودیت‌ها" : "Restrictions", value: item.restrictionsText }, { label: fa ? "یادداشت" : "Notes", value: item.notes }]) };
  }
  const item = record as RehabPlanDto;
  return { eyebrow: fa ? "برنامه توان‌بخشی" : "Rehabilitation plan", title: item.goal ?? (fa ? "توان‌بخشی" : "Rehabilitation"), subtitle: null, date: item.createdAt, sourceLabel: fa ? "ارائه‌دهنده" : "Provider", provider: item.source.providerOrganizationName, status: recordStatusLabel(item.status, fa), statusTone: item.status === "ACTIVE" ? "attention" as const : "neutral" as const, visitId: item.clinicalVisitId, fields: compact([{ label: fa ? "تمرین‌ها" : "Exercises", value: item.exercisesText }, { label: fa ? "دفعات" : "Frequency", value: item.frequencyText }, { label: fa ? "مدت" : "Duration", value: item.durationText }, { label: fa ? "جلسات ثبت‌شده" : "Recorded sessions", value: item.sessions.map((session) => formatDate(session.sessionDate, locale) + (session.progressNotes ? " — " + session.progressNotes : "")).join("\n") }]) };
}

function compact(fields: { label: string; value: string | null | undefined }[]) {
  return fields.filter((field): field is { label: string; value: string } => Boolean(field.value));
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function source(value: string, fa: boolean) { return value === "PROVIDER" || value === "CLINIC" ? (fa ? "ارائه‌دهنده" : "Provider") : (fa ? "مالک/خانواده" : "Owner/household"); }
function formatDate(value: string, locale: "fa" | "en") { return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)); }
function listSlug(kind: RecordKind) { return kind === "lab" ? "labs" : kind; }
