"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, PriorityAction, Skeleton, StatusLabel } from "@petlife/ui";
import { KnowledgeState, type HealthOverviewDto, type HealthSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";

const copy = {
  fa: { title: "سلامت", subtitle: "یک نمای کامل از سابقه پزشکی، وضعیت فعلی و مراقبت‌های بعدی", attention: "نیازمند توجه", complete: "اطلاعات اصلی سلامت تکمیل است", current: "وضعیت فعلی", records: "پرونده پزشکی", care: "مراقبت و پیگیری", allergy: "آلرژی‌ها", condition: "بیماری‌ها", medication: "داروها", vaccination: "واکسیناسیون", active: "داروی فعال", none: "بدون داروی فعال", upcoming: "مراقبت پیش رو", overdue: "عقب‌افتاده", openPlan: "اقدام درمانی باز", recentVisits: "ویزیت‌های اخیر", recentDocuments: "اسناد اخیر", noVisit: "هنوز ویزیتی ثبت نشده", noDocument: "هنوز سندی ثبت نشده", timeline: "خط زمانی سلامت", documents: "اسناد پزشکی", labs: "آزمایش‌ها", imaging: "تصویربرداری", referrals: "ارجاع‌ها", dental: "دندان‌پزشکی", nutrition: "تغذیه", rehab: "توان‌بخشی", observations: "مشاهدات صاحب حیوان", visits: "ویزیت‌های بالینی", open: "مشاهده" },
  en: { title: "Health", subtitle: "One complete view of medical history, current status, and what comes next", attention: "Needs attention", complete: "Core health information is complete", current: "Current status", records: "Medical record", care: "Care and follow-up", allergy: "Allergies", condition: "Conditions", medication: "Medications", vaccination: "Vaccination", active: "active", none: "No active medication", upcoming: "Upcoming care", overdue: "Overdue", openPlan: "Open care item", recentVisits: "Recent visits", recentDocuments: "Recent documents", noVisit: "No clinical visit recorded yet", noDocument: "No medical document recorded yet", timeline: "Health timeline", documents: "Medical documents", labs: "Labs", imaging: "Imaging", referrals: "Referrals", dental: "Dental", nutrition: "Nutrition", rehab: "Rehabilitation", observations: "Owner observations", visits: "Clinical visits", open: "View" },
} as const;

const tone = (state: KnowledgeState) => state === KnowledgeState.KNOWN_NEGATIVE ? "success" as const : state === KnowledgeState.KNOWN_PRESENT ? "neutral" as const : "attention" as const;

export function HealthOverviewView({ petId }: { petId: string }) {
  const locale = useLocale() as "fa" | "en";
  const t = useTranslations("health");
  const c = copy[locale];
  const base = `/${locale}/pets/${petId}/health`;
  const [data, setData] = useState<{ summary: HealthSummaryDto; overview: HealthOverviewDto } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => { setError(false); try { const [summary, overview] = await Promise.all([healthService.getSummary(petId), healthAdvancedService.getOverview(petId)]); setData({ summary, overview }); } catch { setError(true); } }, [petId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorRecovery title={c.title} message="" retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!data) return <Skeleton className="h-72 w-full" aria-label={c.title} />;
  const { summary, overview } = data;
  const attention = summary.primaryAttention;
  return <div className="flex flex-col gap-7">
    <Link className="self-end text-sm font-bold text-brand-natural" href={`${base}/share`}>{locale === "fa" ? "اشتراک با دامپزشک" : "Share with vet"}</Link>
    <header><h1 className="text-page-title text-text-primary">{c.title}</h1><p className="mt-2 text-body text-text-secondary">{c.subtitle}</p></header>
    <ContextSurface>{attention ? <PriorityAction title={t(attention.titleKey.replace("health.", ""))} primaryLabel={c.open} onPrimary={() => location.assign(attention.action === "VIEW_VACCINATION" ? `${base}/vaccination` : `${base}/allergies`)} /> : <p className="text-body text-text-primary">{t("setupStatus.COMPLETE")}</p>}</ContextSurface>
    <section><h2 className="mb-3 text-section-title text-text-primary">{c.current}</h2><ContextSurface className="divide-y divide-border-subtle">
      <Row href={`${base}/allergies`} label={c.allergy}><StatusLabel tone={tone(summary.allergyState)}>{t(`knowledgeState.${summary.allergyState}`)}</StatusLabel></Row>
      <Row href={`${base}/conditions`} label={c.condition}><StatusLabel tone={tone(summary.conditionsState)}>{t(`knowledgeState.${summary.conditionsState}`)}</StatusLabel></Row>
      <Row href={`${base}/medications`} label={c.medication}><StatusLabel tone={summary.activeMedicationCount ? "attention" : "neutral"}>{summary.activeMedicationCount ? `${summary.activeMedicationCount} ${c.active}` : c.none}</StatusLabel></Row>
      <Row href={`${base}/vaccination`} label={c.vaccination}><StatusLabel tone={summary.vaccinationStatus === "UP_TO_DATE" ? "success" : "attention"}>{summary.vaccinationStatus}</StatusLabel></Row>
    </ContextSurface></section>
    <section><h2 className="mb-3 text-section-title text-text-primary">{c.care}</h2><ContextSurface className="divide-y divide-border-subtle"><Metric label={c.upcoming} value={overview.upcomingCare.length}/><Metric label={c.overdue} value={overview.overdueCare.length} attention={overview.overdueCare.length > 0}/><Metric label={c.openPlan} value={overview.unresolvedCarePlanItemsCount} attention={overview.unresolvedCarePlanItemsCount > 0}/></ContextSurface></section>
    <section><h2 className="mb-3 text-section-title text-text-primary">{c.records}</h2><div className="grid gap-x-7 md:grid-cols-2">{[["timeline",c.timeline],["visits",c.visits],["documents",c.documents],["labs",c.labs],["imaging",c.imaging],["referrals",c.referrals],["dental",c.dental],["nutrition",c.nutrition],["rehab",c.rehab],["observations",c.observations]].map(([path,label]) => <Link key={path} href={`${base}/${path}`} className="flex items-center justify-between border-b border-border-subtle py-4 text-body text-text-primary hover:text-brand-natural"><span>{label}</span><span aria-hidden>←</span></Link>)}</div></section>
    <section className="grid gap-5 lg:grid-cols-2"><ContextSurface><h2 className="text-section-title text-text-primary">{c.recentVisits}</h2>{overview.recentVisits.length ? overview.recentVisits.slice(0,3).map(v => <Link key={v.id} href={`${base}/visits/${v.id}`} className="mt-3 block border-t border-border-subtle pt-3 text-body text-text-primary">{v.providerOrganizationName}</Link>) : <p className="mt-3 text-body text-text-secondary">{c.noVisit}</p>}</ContextSurface><ContextSurface><h2 className="text-section-title text-text-primary">{c.recentDocuments}</h2>{overview.recentDocuments.length ? overview.recentDocuments.slice(0,3).map(d => <Link key={d.id} href={`${base}/documents/${d.id}`} className="mt-3 block border-t border-border-subtle pt-3 text-body text-text-primary">{d.title}</Link>) : <p className="mt-3 text-body text-text-secondary">{c.noDocument}</p>}</ContextSurface></section>
  </div>;
}

function Row({ href, label, children }: { href: string; label: string; children: ReactNode }) { return <Link href={href} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><span className="text-body text-text-primary">{label}</span>{children}</Link>; }
function Metric({ label, value, attention=false }: { label: string; value: number; attention?: boolean }) { return <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0"><span className="text-body text-text-primary">{label}</span><StatusLabel tone={attention ? "attention" : "neutral"}>{String(value)}</StatusLabel></div>; }
