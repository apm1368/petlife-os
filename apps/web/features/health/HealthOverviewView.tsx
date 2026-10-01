"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Skeleton, StatusLabel } from "@petlife/ui";
import { SystemState } from "@/features/system/SystemState";
import { KnowledgeState, type HealthOverviewDto, type HealthSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { useStatusText } from "@/lib/status/use-status-text";
import { formatCount } from "@/lib/number/format-number";

const copy = {
  fa: { title: "سلامت", subtitle: "یک نمای کامل از سابقه پزشکی، وضعیت فعلی و مراقبت‌های بعدی", attention: "نیازمند توجه", complete: "اطلاعات اصلی سلامت تکمیل است", current: "وضعیت فعلی", records: "پرونده پزشکی", care: "مراقبت و پیگیری", allergy: "آلرژی‌ها", condition: "بیماری‌ها", medication: "داروها", vaccination: "واکسیناسیون", active: "داروی فعال", none: "بدون داروی فعال", upcoming: "مراقبت پیش رو", overdue: "عقب‌افتاده", openPlan: "اقدام درمانی باز", recentVisits: "ویزیت‌های اخیر", recentDocuments: "اسناد اخیر", noVisit: "هنوز ویزیتی ثبت نشده", noDocument: "هنوز سندی ثبت نشده", timeline: "خط زمانی سلامت", documents: "اسناد پزشکی", labs: "آزمایش‌ها", imaging: "تصویربرداری", referrals: "ارجاع‌ها", dental: "دندان‌پزشکی", nutrition: "تغذیه", rehab: "توان‌بخشی", observations: "مشاهدات صاحب حیوان", visits: "ویزیت‌های بالینی", open: "مشاهده" },
  en: { title: "Health", subtitle: "One complete view of medical history, current status, and what comes next", attention: "Needs attention", complete: "Core health information is complete", current: "Current status", records: "Medical record", care: "Care and follow-up", allergy: "Allergies", condition: "Conditions", medication: "Medications", vaccination: "Vaccination", active: "active", none: "No active medication", upcoming: "Upcoming care", overdue: "Overdue", openPlan: "Open care item", recentVisits: "Recent visits", recentDocuments: "Recent documents", noVisit: "No clinical visit recorded yet", noDocument: "No medical document recorded yet", timeline: "Health timeline", documents: "Medical documents", labs: "Labs", imaging: "Imaging", referrals: "Referrals", dental: "Dental", nutrition: "Nutrition", rehab: "Rehabilitation", observations: "Owner observations", visits: "Clinical visits", open: "View" },
} as const;

const tone = (state: KnowledgeState) => state === KnowledgeState.KNOWN_NEGATIVE ? "success" as const : state === KnowledgeState.KNOWN_PRESENT ? "neutral" as const : "attention" as const;

export function HealthOverviewView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const locale = useLocale() as "fa" | "en";
  const t = useTranslations("health");
  const c = copy[locale];
  const base = `/${locale}/pets/${petId}/health`;
  const [data, setData] = useState<{ summary: HealthSummaryDto; overview: HealthOverviewDto } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => { setError(false); try { const [summary, overview] = await Promise.all([healthService.getSummary(petId), healthAdvancedService.getOverview(petId)]); setData({ summary, overview }); } catch { setError(true); } }, [petId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <SystemState kind="GENERIC_RETRYABLE_ERROR" onRetry={load} />;
  if (!data) return <Skeleton className="h-72 w-full" aria-label={c.title} />;
  const { summary, overview } = data;
  const attention = summary.primaryAttention;
  const Forward = locale === "fa" ? ChevronLeft : ChevronRight;
  return <div className="health-overview">
    <header className="section-head">
      <div><h1>{c.title}</h1><p>{c.subtitle}</p></div>
      <Link className="btn-quiet" href={`${base}/share`}>{locale === "fa" ? "اشتراک با دامپزشک" : "Share with vet"}</Link>
    </header>
    {attention ? (
      <Link className="attention-banner" href={attention.action === "VIEW_VACCINATION" ? `${base}/vaccination` : `${base}/allergies`}>
        <span className="attention-banner__label">{c.attention}</span>
        <strong>{t(attention.titleKey.replace("health.", ""))}</strong>
        <span className="attention-banner__go">{c.open}<Forward size={16} aria-hidden="true" /></span>
      </Link>
    ) : <p className="calm-note">{t("setupStatus.COMPLETE")}</p>}
    <div className="health-overview__grid">
      <div className="health-overview__main">
        <section aria-labelledby="health-current"><h2 id="health-current" className="section-title">{c.current}</h2><div className="row-list">
          <Row href={`${base}/allergies`} label={c.allergy}><StatusLabel tone={tone(summary.allergyState)}>{t(`knowledgeState.${summary.allergyState}`)}</StatusLabel></Row>
          <Row href={`${base}/conditions`} label={c.condition}><StatusLabel tone={tone(summary.conditionsState)}>{t(`knowledgeState.${summary.conditionsState}`)}</StatusLabel></Row>
          <Row href={`${base}/medications`} label={c.medication}><StatusLabel tone={summary.activeMedicationCount ? "attention" : "neutral"}>{summary.activeMedicationCount ? `${formatCount(summary.activeMedicationCount, locale)} ${c.active}` : c.none}</StatusLabel></Row>
          <Row href={`${base}/vaccination`} label={c.vaccination}><StatusLabel tone={statusText.tone(summary.vaccinationStatus, "vaccination")}>{statusText.label(summary.vaccinationStatus, "vaccination")}</StatusLabel></Row>
        </div></section>
        <section aria-labelledby="health-records"><h2 id="health-records" className="section-title">{c.records}</h2><div className="index-list">{[["timeline",c.timeline],["visits",c.visits],["documents",c.documents],["labs",c.labs],["imaging",c.imaging],["referrals",c.referrals],["dental",c.dental],["nutrition",c.nutrition],["rehab",c.rehab],["observations",c.observations]].map(([path,label]) => <Link key={path} href={`${base}/${path}`}><span>{label}</span><Forward size={16} aria-hidden="true" /></Link>)}</div></section>
      </div>
      <aside className="health-overview__aside">
        <section aria-labelledby="health-care"><h2 id="health-care" className="section-title">{c.care}</h2><div className="stat-row">
          <Stat label={c.upcoming} value={overview.upcomingCare.length} />
          <Stat label={c.overdue} value={overview.overdueCare.length} attention={overview.overdueCare.length > 0} />
          <Stat label={c.openPlan} value={overview.unresolvedCarePlanItemsCount} attention={overview.unresolvedCarePlanItemsCount > 0} />
        </div></section>
        <section aria-labelledby="health-visits"><h2 id="health-visits" className="section-title">{c.recentVisits}</h2>{overview.recentVisits.length ? <div className="row-list">{overview.recentVisits.slice(0,3).map(v => <Link key={v.id} href={`${base}/visits/${v.id}`} className="row-list__item"><span>{v.providerOrganizationName}</span><Forward size={16} aria-hidden="true" /></Link>)}</div> : <p className="empty-line">{c.noVisit}</p>}</section>
        <section aria-labelledby="health-docs"><h2 id="health-docs" className="section-title">{c.recentDocuments}</h2>{overview.recentDocuments.length ? <div className="row-list">{overview.recentDocuments.slice(0,3).map(d => <Link key={d.id} href={`${base}/documents/${d.id}`} className="row-list__item"><span>{d.title}</span><Forward size={16} aria-hidden="true" /></Link>)}</div> : <p className="empty-line">{c.noDocument}</p>}</section>
      </aside>
    </div>
  </div>;
}

function Row({ href, label, children }: { href: string; label: string; children: ReactNode }) { return <Link href={href} className="row-list__item"><span>{label}</span>{children}</Link>; }
function Stat({ label, value, attention=false }: { label: string; value: number; attention?: boolean }) { const locale = useLocale(); return <div className={attention ? "stat stat--attention" : "stat"}><strong>{formatCount(value, locale)}</strong><span>{label}</span></div>; }
