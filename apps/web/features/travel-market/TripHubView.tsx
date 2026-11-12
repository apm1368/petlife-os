"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, HeartPulse, MapPin, ShieldCheck, Skeleton, StatusLabel, Stethoscope } from "@petlife/ui";
import type { TripHubDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { requirementStatusTone } from "@/features/travel/travel-status";
import { bookingStatusTone } from "./labels";
import { externalHref } from "@/lib/url/external-href";

const DOC_STATE: Record<string, { key: string; tone: "success" | "attention" | "higherConcern" | "neutral" }> = {
  FOUND: { key: "FOUND", tone: "success" },
  MISSING: { key: "MISSING", tone: "attention" },
  EXPIRING: { key: "EXPIRING", tone: "attention" },
  EXPIRED: { key: "EXPIRED", tone: "higherConcern" },
  UNKNOWN: { key: "UNKNOWN", tone: "neutral" },
};

function tripDate(value: string, locale: "fa" | "en" | "de" | "es", detail = false) {
  const day = value.slice(0, 10);
  if (locale === "fa") return formatDay(day, "fa", { weekday: detail, year: !detail });
  const date = new Date(`${day}T12:00:00+03:30`);
  return new Intl.DateTimeFormat(locale, detail ? { dateStyle: "full", timeZone: "Asia/Tehran" } : { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(date);
}

/**
 * TRIP HUB + TRAVEL READINESS PATTERNS. One page per trip, every section read live from its own
 * domain. Readiness never turns "ready" by itself: rows added from the requirement library start
 * as REQUIRED with their source, jurisdiction and verification date shown; stale rules are flagged.
 */
export function TripHubView({ tripId }: { tripId: string }) {
  const lang = useLocale() as "fa" | "en" | "de" | "es";
  const fa = lang === "fa";
  const t = useTranslations("travel");
  const th = useTranslations("travelHub");
  const [hub, setHub] = useState<TripHubDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHub = useCallback(async () => {
    try {
      setHub(await travelMarketService.hub(tripId));
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [tripId]);
  useEffect(() => void fetchHub(), [fetchHub]);

  if (load === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (load === "notFound") return <div className="mx-auto max-w-3xl py-6"><EmptyState title={th("notFound")} /></div>;
  if (load === "error" || !hub) return <div className="mx-auto max-w-3xl py-6"><ErrorRecovery title={th("loadFailed")} message={th("loadError")} retryLabel={th("retry")} onRetry={() => void fetchHub()} /></div>;

  const { trip, readiness } = hub;
  const addRules = async () => {
    setBusy(true);
    setError(null);
    try {
      setHub(await travelMarketService.addRules(trip.id, selected));
      setSelected([]);
    } catch {
      setError(th("addFailed"));
    } finally {
      setBusy(false);
    }
  };
  const city = trip.destinationCity ?? "";

  return (
    <div className="flex w-full flex-col gap-6">
      <nav className="text-metadata text-text-secondary" aria-label={th("breadcrumb")}><Link className="hover:underline" href={`/${lang}/travel/trips`}>{th("myTrips")}</Link></nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={hub.phase === "UPCOMING" || hub.phase === "IN_PROGRESS" ? "success" : hub.phase === "PLANNING" ? "attention" : "neutral"}>{th(`phase.${hub.phase}`)}</StatusLabel>
          <span className="text-metadata text-text-secondary">{hub.petName}</span>
        </div>
        <h1 className="text-page-title text-text-primary">{th("tripTo", { destination: city || trip.destinationCountry })}</h1>
        <p className="text-body text-text-secondary">{tripDate(trip.departAt, lang, true)}{trip.returnAt ? ` — ${tripDate(trip.returnAt, lang, true)}` : ""} · {t(`travelMode.${trip.travelMode}`)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="h-stays" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2"><h2 id="h-stays" className="text-section-title">{th("stays")}</h2><Link className="text-sm underline" href={`/${lang}/travel/search${city ? `?city=${encodeURIComponent(city)}&checkIn=${trip.departAt.slice(0, 10)}${trip.returnAt ? `&checkOut=${trip.returnAt.slice(0, 10)}` : ""}` : ""}`}>{th("findStay")}</Link></div>
            {hub.bookings.length === 0 ? <p className="text-sm text-text-secondary">{th("noStays")}</p> : (
              <ul className="flex flex-col gap-2">{hub.bookings.map((b) => (
                <li key={b.id}><Link href={`/${lang}/travel/bookings/${b.id}`} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3 hover:border-border-strong">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{b.listingTitle}</span><StatusLabel tone={bookingStatusTone(b.status)}>{th(`bookingStatus.${b.status}`)}</StatusLabel></span>
                  <span className="text-sm text-text-secondary">{tripDate(b.checkIn, lang)} — {tripDate(b.checkOut, lang)} · {th("nights", { count: b.nights })}</span>
                </Link></li>
              ))}</ul>
            )}
          </section>

          <section aria-labelledby="h-ready" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-ready" className="text-section-title">{th("readiness")}</h2>
              <span className="text-sm text-text-secondary">{th("readinessCount", { ready: fa ? localizeDigits(readiness.readyCount, "fa") : readiness.readyCount, total: fa ? localizeDigits(readiness.totalCount, "fa") : readiness.totalCount })}</span>
            </div>
            {readiness.hasStaleRequirement ? <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{th("staleWarning")}</p> : null}
            {readiness.requirements.length === 0 ? <p className="text-sm text-text-secondary">{th("noRequirements")}</p> : (
              <ul className="flex flex-col gap-2">{readiness.requirements.map((r) => {
                const ds = DOC_STATE[hub.documentStates[r.id] ?? "UNKNOWN"]!;
                return (
                  <li key={r.id} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{t(`requirementType.${r.requirementType}`)}</span>
                      <span className="flex gap-2"><StatusLabel tone={requirementStatusTone(r.status)}>{t(`requirementStatus.${r.status}`)}</StatusLabel>{r.status === "UNKNOWN" || r.status === "NOT_REQUIRED" ? null : <StatusLabel tone={ds.tone}>{th(`documentState.${ds.key}`)}</StatusLabel>}</span>
                    </div>
                    {r.notes ? <span>{r.notes}</span> : null}
                    <span className="text-metadata text-text-secondary">
                      {r.source ? `${th("source")}: ${r.source}` : th("noSource")}
                      {r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
                      {r.verifiedAt ? ` · ${th("verified")} ${tripDate(r.verifiedAt, lang)}` : ""}
                      {r.isStale ? ` · ${th("needsRecheck")}` : ""}
                    </span>
                    {externalHref(r.sourceUrl) ? <a className="w-fit text-metadata underline" href={externalHref(r.sourceUrl)!} target="_blank" rel="noopener noreferrer">{th("officialSource")}</a> : null}
                    {r.linkedMedicalDocumentTitle ? <span className="text-metadata">{th("document")}: {r.linkedMedicalDocumentTitle}</span> : null}
                  </li>
                );
              })}</ul>
            )}
            <Link className="w-fit text-sm underline" href={`/${lang}/pets/${trip.petId}/travel/${trip.id}`}>{th("editRequirements")}</Link>
            {hub.suggestions.requirementRules.length ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-3">
                <h3 className="font-bold">{th("suggestionsTitle")}</h3>
                <p className="text-metadata text-text-secondary">{th("suggestionsIntro")}</p>
                {hub.suggestions.requirementRules.map((r) => (
                  <label key={r.id} className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={selected.includes(r.id)} onChange={() => setSelected(selected.includes(r.id) ? selected.filter((x) => x !== r.id) : [...selected, r.id])} />
                    <span className="flex flex-col"><span className="font-bold">{r.title}</span><span>{r.description}</span><span className="text-metadata text-text-secondary">{r.source} · {th("verified")} {tripDate(r.verifiedAt, lang)}{r.isStale ? ` · ${th("mayBeOutdated")}` : ""}</span></span>
                  </label>
                ))}
                {error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
                <Button size="sm" className="w-fit" disabled={!selected.length} isLoading={busy} onClick={() => void addRules()}>{th("addToChecklist")}</Button>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="h-activity" className="flex flex-col gap-2">
            <h2 id="h-activity" className="text-section-title">{th("activity")}</h2>
            {hub.activity.length === 0 ? <p className="text-sm text-text-secondary">{th("noActivity")}</p> : (
              <ol className="flex flex-col gap-1.5 border-s border-border-subtle ps-4 text-sm">
                {hub.activity.map((a, i) => {
                  const label = a.type === "BOOKING" ? (() => { const [ref, status] = a.label.split(":"); return `${ref} · ${th(`bookingStatus.${status ?? "UNKNOWN"}`)}`; })() : a.type === "REQUIREMENT" ? (() => { const [type, status] = a.label.split(":"); return `${t(`requirementType.${type}`)} · ${t(`requirementStatus.${status}`)}`; })() : a.type === "INSURANCE" ? `${th("insurance")} · ${th(`insuranceApplicationStatus.${a.label}`)}` : a.label;
                  const when = new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-ca-persian" : lang, { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(a.at));
                  return <li key={i}>{a.link ? <Link className="underline" href={`/${lang}${a.link}`}>{label}</Link> : label} <span className="text-text-secondary">· {when}</span></li>;
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label={th("companions")}>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck aria-hidden className="h-4 w-4" />{th("insurance")}</h2>
            {hub.insuranceApplications.length ? <ul className="flex flex-col gap-1 text-sm">{hub.insuranceApplications.map((a) => <li key={a.id}>{a.providerName} · {a.productName} <span className="text-text-secondary">· {th(`insuranceApplicationStatus.${a.status}`)}</span></li>)}</ul> : <p className="text-sm text-text-secondary">{th("noInsurance")}</p>}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/insurance`}>{th("compareInsurance")}</Link>
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><MapPin aria-hidden className="h-4 w-4" />{th("places")}</h2>
            {[...hub.favoritePlaces, ...hub.nearbyPlaces.filter((p) => !hub.favoritePlaces.some((f) => f.id === p.id))].slice(0, 8).map((p) => <Link key={p.id} className="block text-sm hover:underline" href={`/${lang}/places/${p.id}`}>{hub.favoritePlaces.some((f) => f.id === p.id) ? "♥ " : ""}{p.name}</Link>)}
            {hub.nearbyPlaces.length + hub.favoritePlaces.length === 0 ? <p className="text-sm text-text-secondary">{th("noPlaces")}</p> : null}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/places${city ? `?city=${encodeURIComponent(city)}` : ""}`}>{th("allPlaces")}</Link>
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Stethoscope aria-hidden className="h-4 w-4" />{th("vets")}</h2>
            {hub.nearbyVets.length ? hub.nearbyVets.map((v) => <Link key={v.id} className="block text-sm hover:underline" href={`/${lang}/vet/${v.id}`}>{v.name}</Link>) : <p className="text-sm text-text-secondary">{th("noVets")}</p>}
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><HeartPulse aria-hidden className="h-4 w-4" />{th("travelDocuments")}</h2>
            {hub.documents.length ? hub.documents.map((d) => <p key={d.id} className="text-sm">{d.title}{d.linkedRequirementIds.length ? ` · ${th("linked")}` : ""}</p>) : <p className="text-sm text-text-secondary">{th("noDocuments")}</p>}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/pets/${trip.petId}/health/advanced/documents`}>{th("documents")}</Link>
          </div>
          <Link className="text-sm underline" href={`/${lang}/support/new?relatedEntityType=TRIP&relatedEntityId=${trip.id}`}>{th("supportTrip")}</Link>
        </aside>
      </div>
    </div>
  );
}
