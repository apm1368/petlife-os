"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Skeleton, StatusLabel } from "@petlife/ui";
import { KnowledgeState, type HealthOverviewDto, type HealthSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { useStatusText } from "@/lib/status/use-status-text";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { formatCount } from "@/lib/number/format-number";
import { HealthCareFrame } from "./HealthCareFrame";
import { HealthLoadFailure } from "./HealthLoadFailure";

const tone = (state: KnowledgeState) => state === KnowledgeState.KNOWN_NEGATIVE ? "success" as const : state === KnowledgeState.KNOWN_PRESENT ? "neutral" as const : "attention" as const;

export function HealthOverviewView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const recordsT = useTranslations("rollout.records");
  const locale = useLocale() as "fa" | "en" | "de" | "es";
  const t = useTranslations("health");
  const c = useTranslations("health.overview");
  const base = `/${locale}/pets/${petId}/health`;
  const [data, setData] = useState<{ summary: HealthSummaryDto; overview: HealthOverviewDto; names: { allergies: string[]; conditions: string[]; medications: string[] }; care: CareReminder[] } | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const load = useCallback(async () => { setError(null); try { const [summary, overview, allergies, conditions, medications, care] = await Promise.all([healthService.getSummary(petId), healthAdvancedService.getOverview(petId), healthService.listAllergies(petId).catch(() => []), healthService.listConditions(petId).catch(() => []), healthService.listMedications(petId).catch(() => []), careRemindersService.list(petId).catch(() => [])]); setData({ summary, overview, care, names: { allergies: allergies.filter((a) => a.status === "ACTIVE").map((a) => a.name), conditions: conditions.filter((x) => x.status === "ACTIVE").map((x) => x.name), medications: medications.filter((m) => m.status === "ACTIVE").map((m) => m.name) } }); } catch (failure) { setError(failure); } }, [petId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <HealthLoadFailure error={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-72 w-full" aria-label={c("title")} />;
  const { summary, overview, names, care } = data;
  // The owner's care items count alongside provider care-plan items, as in the care center.
  const careUpcoming = overview.upcomingCare.length + care.filter((i) => ["UPCOMING", "DUE", "SNOOZED"].includes(i.state)).length;
  const careOverdue = overview.overdueCare.length + care.filter((i) => i.state === "OVERDUE").length;
  const attention = summary.primaryAttention;
  const Forward = locale === "fa" ? ChevronLeft : ChevronRight;
  return <HealthCareFrame><div className="health-overview">
    <header className="section-head">
      <div><h1>{c("title")}</h1><p>{c("subtitle")}</p></div>
      <Link className="btn-quiet" href={`${base}/share`}>{c("shareVet")}</Link>
    </header>
    {attention ? (
      <Link className="attention-banner" href={attention.action === "VIEW_VACCINATION" ? `${base}/vaccination` : `${base}/allergies`}>
        <span className="attention-banner__label">{c("attention")}</span>
        <strong>{t(attention.titleKey.replace("health.", ""))}</strong>
        <span className="attention-banner__go">{c("open")}<Forward size={16} aria-hidden="true" /></span>
      </Link>
    ) : <p className="calm-note">{c("complete")}</p>}
    <nav className="flex flex-wrap gap-3"><Link className="btn-quiet" href={`${base}/activity`}>{c("activity")}</Link><Link className="btn-quiet" href={`${base}/links`}>{c("sharesLink")}</Link></nav>
    <div className="health-overview__grid">
      <div className="health-overview__main">
        <section aria-labelledby="health-current"><h2 id="health-current" className="section-title">{c("current")}</h2><div className="row-list">
          <Row href={`${base}/allergies`} label={c("allergies")} detail={nameList(names.allergies, locale, c("moreItems", { count: formatCount(Math.max(0, names.allergies.length - 2), locale) }))}><StatusLabel tone={tone(summary.allergyState)}>{t(`knowledgeState.${summary.allergyState}`)}</StatusLabel></Row>
          <Row href={`${base}/conditions`} label={c("conditions")} detail={nameList(names.conditions, locale, c("moreItems", { count: formatCount(Math.max(0, names.conditions.length - 2), locale) }))}><StatusLabel tone={tone(summary.conditionsState)}>{t(`knowledgeState.${summary.conditionsState}`)}</StatusLabel></Row>
          <Row href={`${base}/medications`} label={c("medications")} detail={nameList(names.medications, locale, c("moreItems", { count: formatCount(Math.max(0, names.medications.length - 2), locale) }))}><StatusLabel tone="neutral">{summary.activeMedicationCount ? `${formatCount(summary.activeMedicationCount, locale)} ${c("active")}` : c("noActiveMedications")}</StatusLabel></Row>
          <Row href={`${base}/vaccination`} label={c("vaccination")}><StatusLabel tone={statusText.tone(summary.vaccinationStatus, "vaccination")}>{statusText.label(summary.vaccinationStatus, "vaccination")}</StatusLabel></Row>
        </div></section>
        <Link className="btn-quiet" href={`${base}/clinical`}>{recordsT("clinical")}</Link>
        <section aria-labelledby="health-records"><h2 id="health-records" className="section-title">{c("records")}</h2><div className="index-list">{[["timeline",c("timeline")],["visits",c("visits")],["documents",c("documents")],["labs",c("labs")],["imaging",c("imaging")],["referrals",c("referrals")],["dental",c("dental")],["nutrition",c("nutrition")],["rehab",c("rehab")],["observations",c("observations")]].map(([path,label]) => <Link key={path} href={`${base}/${path}`}><span>{label}</span><Forward size={16} aria-hidden="true" /></Link>)}</div></section>
      </div>
      <aside className="health-overview__aside">
        <section aria-labelledby="health-care"><h2 id="health-care" className="section-title">{c("care")}</h2><div className="stat-row">
          <Stat label={c("upcoming")} value={careUpcoming} />
          <Stat label={c("overdue")} value={careOverdue} attention={careOverdue > 0} />
          <Stat label={c("openPlan")} value={overview.unresolvedCarePlanItemsCount} attention={overview.unresolvedCarePlanItemsCount > 0} />
        </div></section>
        <section aria-labelledby="health-visits"><h2 id="health-visits" className="section-title">{c("recentVisits")}</h2>{overview.recentVisits.length ? <div className="row-list">{overview.recentVisits.slice(0,3).map(v => <Link key={v.id} href={`${base}/visits/${v.id}`} className="row-list__item"><span>{v.providerOrganizationName}</span><Forward size={16} aria-hidden="true" /></Link>)}</div> : <p className="empty-line">{c("noVisit")}</p>}</section>
        <section aria-labelledby="health-docs"><h2 id="health-docs" className="section-title">{c("recentDocuments")}</h2>{overview.recentDocuments.length ? <div className="row-list">{overview.recentDocuments.slice(0,3).map(d => <Link key={d.id} href={`${base}/documents/${d.id}`} className="row-list__item"><span>{d.title}</span><Forward size={16} aria-hidden="true" /></Link>)}</div> : <p className="empty-line">{c("noDocument")}</p>}</section>
      </aside>
    </div>
  </div></HealthCareFrame>;
}

function Row({ href, label, detail, children }: { href: string; label: string; detail?: string | null; children: ReactNode }) { return <Link href={href} className="row-list__item"><span className="flex min-w-0 flex-col gap-0.5"><span>{label}</span>{detail ? <span className="health-overview__names">{detail}</span> : null}</span>{children}</Link>; }
/** What is on record, by name (clinical names are shown exactly as recorded): two names, then a count. */
function nameList(items: string[], locale: "fa" | "en" | "de" | "es", moreLabel: string): string | null {
  if (!items.length) return null;
  const shown = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items.slice(0, 2));
  return items.length > 2 ? `${shown} ${moreLabel}` : shown;
}
function Stat({ label, value, attention=false }: { label: string; value: number; attention?: boolean }) { const locale = useLocale(); return <div className={attention ? "stat stat--attention" : "stat"}><strong>{formatCount(value, locale)}</strong><span>{label}</span></div>; }
