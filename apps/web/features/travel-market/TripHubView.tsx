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
import { bookingStatusLabel, bookingStatusTone, stayDates } from "./labels";

const DOC_STATE: Record<string, { fa: string; en: string; tone: "success" | "attention" | "higherConcern" | "neutral" }> = {
  FOUND: { fa: "مدرک موجود", en: "Evidence on file", tone: "success" },
  MISSING: { fa: "مدرک ثبت نشده", en: "Missing", tone: "attention" },
  EXPIRING: { fa: "رو به انقضا", en: "Expiring soon", tone: "attention" },
  EXPIRED: { fa: "منقضی", en: "Expired", tone: "higherConcern" },
  UNKNOWN: { fa: "نامشخص", en: "Unknown", tone: "neutral" },
};
const PHASE: Record<TripHubDto["phase"], [string, string]> = { PLANNING: ["در حال برنامه‌ریزی", "Planning"], UPCOMING: ["پیش رو", "Upcoming"], IN_PROGRESS: ["در سفر", "Travelling"], COMPLETED: ["پایان یافته", "Completed"], CANCELLED: ["لغو شده", "Cancelled"] };

/**
 * TRIP HUB + TRAVEL READINESS PATTERNS. One page per trip, every section read live from its own
 * domain. Readiness never turns "ready" by itself: rows added from the requirement library start
 * as REQUIRED with their source, jurisdiction and verification date shown; stale rules are flagged.
 */
export function TripHubView({ tripId }: { tripId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const t = useTranslations("travel");
  const tIns = useTranslations("insurance");
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
  if (load === "notFound") return <div className="mx-auto max-w-3xl py-6"><EmptyState title={fa ? "این سفر پیدا نشد" : "Trip not found"} /></div>;
  if (load === "error" || !hub) return <div className="mx-auto max-w-3xl py-6"><ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchHub()} /></div>;

  const { trip, readiness } = hub;
  const addRules = async () => {
    setBusy(true);
    setError(null);
    try {
      setHub(await travelMarketService.addRules(trip.id, selected));
      setSelected([]);
    } catch {
      setError(fa ? "افزودن انجام نشد." : "Could not add.");
    } finally {
      setBusy(false);
    }
  };
  const city = trip.destinationCity ?? "";

  return (
    <div className="flex w-full flex-col gap-6">
      <nav className="text-metadata text-text-secondary" aria-label={fa ? "مسیر" : "Breadcrumb"}><Link className="hover:underline" href={`/${lang}/travel/trips`}>{fa ? "سفرهای من" : "My trips"}</Link></nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={hub.phase === "UPCOMING" || hub.phase === "IN_PROGRESS" ? "success" : hub.phase === "PLANNING" ? "attention" : "neutral"}>{PHASE[hub.phase][fa ? 0 : 1]}</StatusLabel>
          <span className="text-metadata text-text-secondary">{hub.petName}</span>
        </div>
        <h1 className="text-page-title text-text-primary">{fa ? `سفر به ${city || trip.destinationCountry}` : `Trip to ${city || trip.destinationCountry}`}</h1>
        <p className="text-body text-text-secondary">{formatDay(trip.departAt.slice(0, 10), lang, { weekday: true })}{trip.returnAt ? ` — ${formatDay(trip.returnAt.slice(0, 10), lang, { weekday: true })}` : ""} · {t(`travelMode.${trip.travelMode}`)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="h-stays" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2"><h2 id="h-stays" className="text-section-title">{fa ? "اقامت‌ها" : "Stays"}</h2><Link className="text-sm underline" href={`/${lang}/travel/search${city ? `?city=${encodeURIComponent(city)}&checkIn=${trip.departAt.slice(0, 10)}${trip.returnAt ? `&checkOut=${trip.returnAt.slice(0, 10)}` : ""}` : ""}`}>{fa ? "یافتن اقامت" : "Find a stay"}</Link></div>
            {hub.bookings.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "هنوز اقامتی به این سفر اضافه نشده است." : "No stays in this trip yet."}</p> : (
              <ul className="flex flex-col gap-2">{hub.bookings.map((b) => (
                <li key={b.id}><Link href={`/${lang}/travel/bookings/${b.id}`} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3 hover:border-border-strong">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{b.listingTitle}</span><StatusLabel tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status, lang)}</StatusLabel></span>
                  <span className="text-sm text-text-secondary">{stayDates(b, lang)}</span>
                </Link></li>
              ))}</ul>
            )}
          </section>

          <section aria-labelledby="h-ready" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-ready" className="text-section-title">{fa ? "آمادگی سفر" : "Trip readiness"}</h2>
              <span className="text-sm text-text-secondary">{fa ? `${localizeDigits(readiness.readyCount, "fa")} از ${localizeDigits(readiness.totalCount, "fa")} آماده` : `${readiness.readyCount} of ${readiness.totalCount} ready`}</span>
            </div>
            {readiness.hasStaleRequirement ? <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{fa ? "برخی الزامات مدتی است بازبینی نشده‌اند؛ پیش از سفر از منبع رسمی بررسی کنید." : "Some requirements have not been re-verified recently; check the official source before travelling."}</p> : null}
            {readiness.requirements.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "هنوز الزامی ثبت نشده است." : "No requirements recorded yet."}</p> : (
              <ul className="flex flex-col gap-2">{readiness.requirements.map((r) => {
                const ds = DOC_STATE[hub.documentStates[r.id] ?? "UNKNOWN"]!;
                return (
                  <li key={r.id} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{t(`requirementType.${r.requirementType}`)}</span>
                      <span className="flex gap-2"><StatusLabel tone={requirementStatusTone(r.status)}>{t(`requirementStatus.${r.status}`)}</StatusLabel>{r.status === "UNKNOWN" || r.status === "NOT_REQUIRED" ? null : <StatusLabel tone={ds.tone}>{fa ? ds.fa : ds.en}</StatusLabel>}</span>
                    </div>
                    {r.notes ? <span>{r.notes}</span> : null}
                    <span className="text-metadata text-text-secondary">
                      {r.source ? `${fa ? "منبع" : "Source"}: ${r.source}` : fa ? "منبع ثبت نشده" : "No source recorded"}
                      {r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
                      {r.verifiedAt ? ` · ${fa ? "بررسی" : "verified"} ${formatDay(r.verifiedAt.slice(0, 10), lang)}` : ""}
                      {r.isStale ? (fa ? " · نیازمند بازبینی" : " · needs re-checking") : ""}
                    </span>
                    {r.sourceUrl ? <a className="w-fit text-metadata underline" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{fa ? "منبع رسمی" : "Official source"}</a> : null}
                    {r.linkedMedicalDocumentTitle ? <span className="text-metadata">{fa ? "مدرک: " : "Document: "}{r.linkedMedicalDocumentTitle}</span> : null}
                  </li>
                );
              })}</ul>
            )}
            <Link className="w-fit text-sm underline" href={`/${lang}/pets/${trip.petId}/travel/${trip.id}`}>{fa ? "ویرایش الزامات و پیوند مدارک" : "Edit requirements and link documents"}</Link>
            {hub.suggestions.requirementRules.length ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-3">
                <h3 className="font-bold">{fa ? "الزامات پیشنهادی برای این مقصد" : "Suggested for this destination"}</h3>
                <p className="text-metadata text-text-secondary">{fa ? "از کتابخانهٔ الزامات که تیم PET LIFE با ذکر منبع نگهداری می‌کند. پس از افزودن «لازم» ثبت می‌شوند و باید مدرکش را تهیه کنید." : "From the requirement library PET LIFE maintains with sources. Added rows start as “required” until you provide evidence."}</p>
                {hub.suggestions.requirementRules.map((r) => (
                  <label key={r.id} className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={selected.includes(r.id)} onChange={() => setSelected(selected.includes(r.id) ? selected.filter((x) => x !== r.id) : [...selected, r.id])} />
                    <span className="flex flex-col"><span className="font-bold">{r.title}</span><span>{r.description}</span><span className="text-metadata text-text-secondary">{r.source} · {fa ? "بررسی" : "verified"} {formatDay(r.verifiedAt.slice(0, 10), lang)}{r.isStale ? (fa ? " · قدیمی" : " · may be outdated") : ""}</span></span>
                  </label>
                ))}
                {error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
                <Button size="sm" className="w-fit" disabled={!selected.length} isLoading={busy} onClick={() => void addRules()}>{fa ? "افزودن به چک‌لیست" : "Add to checklist"}</Button>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="h-activity" className="flex flex-col gap-2">
            <h2 id="h-activity" className="text-section-title">{fa ? "فعالیت اخیر" : "Recent activity"}</h2>
            {hub.activity.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "فعالیتی ثبت نشده است." : "No activity yet."}</p> : (
              <ol className="flex flex-col gap-1.5 border-s border-border-subtle ps-4 text-sm">
                {hub.activity.map((a, i) => {
                  const label = a.type === "BOOKING" ? (() => { const [ref, status] = a.label.split(":"); return `${ref} · ${bookingStatusLabel(status ?? "", lang)}`; })() : a.type === "REQUIREMENT" ? (() => { const [type, status] = a.label.split(":"); return `${t(`requirementType.${type}`)} · ${t(`requirementStatus.${status}`)}`; })() : a.type === "INSURANCE" ? `${fa ? "بیمه" : "Insurance"} · ${tIns(`applicationStatus.${a.label}`)}` : a.label;
                  const when = new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(a.at));
                  return <li key={i}>{a.link ? <Link className="underline" href={`/${lang}${a.link}`}>{label}</Link> : label} <span className="text-text-secondary">· {when}</span></li>;
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label={fa ? "همراه سفر" : "Trip companions"}>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck aria-hidden className="h-4 w-4" />{fa ? "بیمه" : "Insurance"}</h2>
            {hub.insuranceApplications.length ? <ul className="flex flex-col gap-1 text-sm">{hub.insuranceApplications.map((a) => <li key={a.id}>{a.providerName} · {a.productName} <span className="text-text-secondary">· {tIns(`applicationStatus.${a.status}`)}</span></li>)}</ul> : <p className="text-sm text-text-secondary">{fa ? "درخواست بیمه‌ای برای این حیوان ندارید." : "No insurance applications for this pet."}</p>}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/insurance`}>{fa ? "مقایسهٔ بیمه‌ها" : "Compare insurance"}</Link>
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><MapPin aria-hidden className="h-4 w-4" />{fa ? "مکان‌های مقصد" : "Places at the destination"}</h2>
            {[...hub.favoritePlaces, ...hub.nearbyPlaces.filter((p) => !hub.favoritePlaces.some((f) => f.id === p.id))].slice(0, 8).map((p) => <Link key={p.id} className="block text-sm hover:underline" href={`/${lang}/places/${p.id}`}>{hub.favoritePlaces.some((f) => f.id === p.id) ? "♥ " : ""}{p.name}</Link>)}
            {hub.nearbyPlaces.length + hub.favoritePlaces.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "مکانی در این شهر ثبت نشده است." : "No places listed in this city yet."}</p> : null}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/places${city ? `?city=${encodeURIComponent(city)}` : ""}`}>{fa ? "همهٔ مکان‌ها" : "All places"}</Link>
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Stethoscope aria-hidden className="h-4 w-4" />{fa ? "دامپزشک در مقصد" : "Vets at the destination"}</h2>
            {hub.nearbyVets.length ? hub.nearbyVets.map((v) => <Link key={v.id} className="block text-sm hover:underline" href={`/${lang}/vet/${v.id}`}>{v.name}</Link>) : <p className="text-sm text-text-secondary">{fa ? "دامپزشکی در این شهر ثبت نشده است." : "No vets listed in this city yet."}</p>}
          </div>
          <div className="rounded-md border border-border-subtle p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><HeartPulse aria-hidden className="h-4 w-4" />{fa ? "مدارک سفر" : "Travel documents"}</h2>
            {hub.documents.length ? hub.documents.map((d) => <p key={d.id} className="text-sm">{d.title}{d.linkedRequirementIds.length ? (fa ? " · پیوندشده" : " · linked") : ""}</p>) : <p className="text-sm text-text-secondary">{fa ? "مدرک سفر یا گواهی واکسنی ثبت نشده است." : "No travel or vaccination documents on file."}</p>}
            <Link className="mt-2 inline-block text-sm underline" href={`/${lang}/pets/${trip.petId}/health/advanced/documents`}>{fa ? "پروندهٔ مدارک" : "Documents"}</Link>
          </div>
          <Link className="text-sm underline" href={`/${lang}/support/new?relatedEntityType=TRIP&relatedEntityId=${trip.id}`}>{fa ? "درخواست پشتیبانی برای این سفر" : "Get help with this trip"}</Link>
        </aside>
      </div>
    </div>
  );
}
