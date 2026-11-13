"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ChevronLeft, ChevronRight, Skeleton, StatusLabel } from "@petlife/ui";
import { KnowledgeState, type HealthOverviewDto, type HealthSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { useStatusText } from "@/lib/status/use-status-text";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { formatCount } from "@/lib/number/format-number";
import { HealthCareFrame } from "./HealthCareFrame";
import { HealthLoadFailure } from "./HealthLoadFailure";

const tone = (state: KnowledgeState) =>
  state === KnowledgeState.KNOWN_NEGATIVE
    ? ("success" as const)
    : state === KnowledgeState.KNOWN_PRESENT
      ? ("neutral" as const)
      : ("attention" as const);

type HealthOverviewData = {
  petId: string;
  summary: HealthSummaryDto;
  overview: HealthOverviewDto;
  names: { allergies: string[]; conditions: string[]; medications: string[] };
  care: CareReminder[];
  unavailable: { allergies: boolean; conditions: boolean; medications: boolean; care: boolean };
};

export function HealthOverviewView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const recordsT = useTranslations("rollout.records");
  const locale = useLocale() as "fa" | "en" | "de" | "es" | "ar" | "nl";
  const t = useTranslations("health");
  const c = useTranslations("health.overview");
  const base = `/${locale}/pets/${petId}/health`;
  const [data, setData] = useState<HealthOverviewData | null>(null);
  const [error, setError] = useState<{ petId: string; cause: unknown } | null>(null);
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    setError(null);
    try {
      const [summary, overview] = await Promise.all([
        healthService.getSummary(petId),
        healthAdvancedService.getOverview(petId),
      ]);
      const [allergiesResult, conditionsResult, medicationsResult, careResult] = await Promise.allSettled([
        healthService.listAllergies(petId),
        healthService.listConditions(petId),
        healthService.listMedications(petId),
        careRemindersService.list(petId),
      ]);
      if (request !== requestSequence.current) return;
      const allergies = allergiesResult.status === "fulfilled" ? allergiesResult.value : [];
      const conditions = conditionsResult.status === "fulfilled" ? conditionsResult.value : [];
      const medications = medicationsResult.status === "fulfilled" ? medicationsResult.value : [];
      const care = careResult.status === "fulfilled" ? careResult.value : [];
      setData({
        petId,
        summary,
        overview,
        care,
        names: {
          allergies: allergies.filter((a) => a.status === "ACTIVE").map((a) => a.name),
          conditions: conditions.filter((x) => x.status === "ACTIVE").map((x) => x.name),
          medications: medications.filter((m) => m.status === "ACTIVE").map((m) => m.name),
        },
        unavailable: {
          allergies: allergiesResult.status === "rejected",
          conditions: conditionsResult.status === "rejected",
          medications: medicationsResult.status === "rejected",
          care: careResult.status === "rejected",
        },
      });
    } catch (cause) {
      if (request === requestSequence.current) setError({ petId, cause });
    }
  }, [petId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error?.petId === petId) return <HealthLoadFailure error={error.cause} onRetry={load} />;
  // Keep the old pet's summary out of the first render while a route change's
  // effect is waiting to start its requests.
  if (!data || data.petId !== petId) return <Skeleton className="h-72 w-full" aria-label={c("title")} />;
  const { summary, overview, names, care } = data;
  // The owner's care items count alongside provider care-plan items, as in the care center.
  const careUpcoming =
    overview.upcomingCare.length +
    care.filter((i) => ["UPCOMING", "DUE", "SNOOZED"].includes(i.state)).length;
  const careOverdue = overview.overdueCare.length + care.filter((i) => i.state === "OVERDUE").length;
  const attention = summary.primaryAttention;
  const Forward = (locale === "fa" || locale === "ar") ? ChevronLeft : ChevronRight;
  const hasUnavailableDetails = Object.values(data.unavailable).some(Boolean);
  return (
    <HealthCareFrame>
      <div className="health-overview">
        <header className="section-head">
          <div>
            <h1>{c("title")}</h1>
            <p>{c("subtitle")}</p>
          </div>
          <Link className="btn-quiet" href={`${base}/share`}>
            {c("shareVet")}
          </Link>
        </header>
        {hasUnavailableDetails ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-state-attention bg-state-attention/5 p-4 text-text-primary"
          >
            <p>{c("partialUnavailable")}</p>
            <Button variant="secondary" onClick={load}>
              {c("retry")}
            </Button>
          </div>
        ) : null}
        {attention ? (
          <Link
            className="attention-banner"
            href={attention.action === "VIEW_VACCINATION" ? `${base}/vaccination` : `${base}/allergies`}
          >
            <span className="attention-banner__label">{c("attention")}</span>
            <strong>{t(attention.titleKey.replace("health.", ""))}</strong>
            <span className="attention-banner__go">
              {c("open")}
              <Forward size={16} aria-hidden="true" />
            </span>
          </Link>
        ) : (
          <p className="calm-note">{c("complete")}</p>
        )}
        <nav className="flex flex-wrap gap-3">
          <Link className="btn-quiet" href={`${base}/activity`}>
            {c("activity")}
          </Link>
          <Link className="btn-quiet" href={`${base}/links`}>
            {c("sharesLink")}
          </Link>
        </nav>
        <div className="health-overview__grid">
          <div className="health-overview__main">
            <section aria-labelledby="health-current">
              <h2 id="health-current" className="section-title">
                {c("current")}
              </h2>
              <div className="row-list">
                <Row
                  href={`${base}/allergies`}
                  label={c("allergies")}
                  detail={
                    data.unavailable.allergies
                      ? c("detailsUnavailable")
                      : nameList(
                          names.allergies,
                          locale,
                          c("moreItems", {
                            count: formatCount(Math.max(0, names.allergies.length - 2), locale),
                          }),
                        )
                  }
                >
                  <StatusLabel tone={data.unavailable.allergies ? "attention" : tone(summary.allergyState)}>
                    {data.unavailable.allergies ? c("detailsUnavailable") : t(`knowledgeState.${summary.allergyState}`)}
                  </StatusLabel>
                </Row>
                <Row
                  href={`${base}/conditions`}
                  label={c("conditions")}
                  detail={
                    data.unavailable.conditions
                      ? c("detailsUnavailable")
                      : nameList(
                          names.conditions,
                          locale,
                          c("moreItems", {
                            count: formatCount(Math.max(0, names.conditions.length - 2), locale),
                          }),
                        )
                  }
                >
                  <StatusLabel tone={data.unavailable.conditions ? "attention" : tone(summary.conditionsState)}>
                    {data.unavailable.conditions ? c("detailsUnavailable") : t(`knowledgeState.${summary.conditionsState}`)}
                  </StatusLabel>
                </Row>
                <Row
                  href={`${base}/medications`}
                  label={c("medications")}
                  detail={
                    data.unavailable.medications
                      ? c("detailsUnavailable")
                      : nameList(
                          names.medications,
                          locale,
                          c("moreItems", {
                            count: formatCount(Math.max(0, names.medications.length - 2), locale),
                          }),
                        )
                  }
                >
                  <StatusLabel tone="neutral">
                    {summary.activeMedicationCount
                      ? `${formatCount(summary.activeMedicationCount, locale)} ${c("active")}`
                      : c("noActiveMedications")}
                  </StatusLabel>
                </Row>
                <Row href={`${base}/vaccination`} label={c("vaccination")}>
                  <StatusLabel tone={statusText.tone(summary.vaccinationStatus, "vaccination")}>
                    {statusText.label(summary.vaccinationStatus, "vaccination")}
                  </StatusLabel>
                </Row>
              </div>
            </section>
            <Link className="btn-quiet" href={`${base}/clinical`}>
              {recordsT("clinical")}
            </Link>
            <section aria-labelledby="health-records">
              <h2 id="health-records" className="section-title">
                {c("records")}
              </h2>
              <div className="index-list">
                {[
                  ["timeline", c("timeline")],
                  ["visits", c("visits")],
                  ["documents", c("documents")],
                  ["labs", c("labs")],
                  ["imaging", c("imaging")],
                  ["referrals", c("referrals")],
                  ["dental", c("dental")],
                  ["nutrition", c("nutrition")],
                  ["rehab", c("rehab")],
                  ["observations", c("observations")],
                ].map(([path, label]) => (
                  <Link key={path} href={`${base}/${path}`}>
                    <span>{label}</span>
                    <Forward size={16} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
          <aside className="health-overview__aside">
            <section aria-labelledby="health-care">
              <h2 id="health-care" className="section-title">
                {c("care")}
              </h2>
              {data.unavailable.care ? (
                <p className="mb-3 text-sm text-text-secondary">{c("detailsUnavailable")}</p>
              ) : null}
              <div className="stat-row">
                <Stat label={c("upcoming")} value={careUpcoming} />
                <Stat label={c("overdue")} value={careOverdue} attention={careOverdue > 0} />
                <Stat
                  label={c("openPlan")}
                  value={overview.unresolvedCarePlanItemsCount}
                  attention={overview.unresolvedCarePlanItemsCount > 0}
                />
              </div>
            </section>
            <section aria-labelledby="health-visits">
              <h2 id="health-visits" className="section-title">
                {c("recentVisits")}
              </h2>
              {overview.recentVisits.length ? (
                <div className="row-list">
                  {overview.recentVisits.slice(0, 3).map((v) => (
                    <Link key={v.id} href={`${base}/visits/${v.id}`} className="row-list__item">
                      <span>{v.providerOrganizationName}</span>
                      <Forward size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="empty-line">{c("noVisit")}</p>
              )}
            </section>
            <section aria-labelledby="health-docs">
              <h2 id="health-docs" className="section-title">
                {c("recentDocuments")}
              </h2>
              {overview.recentDocuments.length ? (
                <div className="row-list">
                  {overview.recentDocuments.slice(0, 3).map((d) => (
                    <Link key={d.id} href={`${base}/documents/${d.id}`} className="row-list__item">
                      <span>{d.title}</span>
                      <Forward size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="empty-line">{c("noDocument")}</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </HealthCareFrame>
  );
}

function Row({
  href,
  label,
  detail,
  children,
}: {
  href: string;
  label: string;
  detail?: string | null;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="row-list__item">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{label}</span>
        {detail ? <span className="health-overview__names">{detail}</span> : null}
      </span>
      {children}
    </Link>
  );
}
/** What is on record, by name (clinical names are shown exactly as recorded): two names, then a count. */
function nameList(items: string[], locale: "fa" | "en" | "de" | "es" | "ar" | "nl", moreLabel: string): string | null {
  if (!items.length) return null;
  const shown = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items.slice(0, 2));
  return items.length > 2 ? `${shown} ${moreLabel}` : shown;
}
function Stat({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  const locale = useLocale();
  return (
    <div className={attention ? "stat stat--attention" : "stat"}>
      <strong>{formatCount(value, locale)}</strong>
      <span>{label}</span>
    </div>
  );
}
