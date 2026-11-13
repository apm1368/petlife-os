"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import {
  adminPlaceSuggestionsService,
  type AdminPlaceSuggestionDto,
  type PlaceSuggestionKind,
  type PlaceSuggestionStatus,
} from "@/services/admin-place-suggestions.service";
import { useAdminStore } from "@/stores/admin-store";
import { Panel, Tag } from "../console-ui";

type Lang = "fa" | "en" | "de" | "es" | "ar" | "nl";
const STATUSES: PlaceSuggestionStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const KINDS: PlaceSuggestionKind[] = ["NEW_PLACE", "CORRECTION", "CLOSURE_REPORT"];
const KIND_TONE = { NEW_PLACE: "brand", CORRECTION: "attention", CLOSURE_REPORT: "concern" } as const;

function errorCode(e: unknown) {
  return e instanceof ApiError ? String((e.details as { reason?: string } | undefined)?.reason ?? e.code) : "FAILED";
}

/**
 * Owner #6 (2026-11-13): staff review members' place suggestions — new places, corrections and closure reports.
 * Approving a new place creates it unverified and unlisted (staff verify and list it on the places page); rejecting
 * needs the reason the member is told. Duplicate hints are advisory only.
 */
export function AdminPlaceSuggestionsView() {
  const t = useTranslations("adminPlaceSuggestions");
  const tPlaces = useTranslations("places");
  const lang = useLocale() as Lang;
  const context = useAdminStore((s) => s.context);
  const status = useAdminStore((s) => s.status);
  const canRead = status === "ready" && context?.isAdmin === true && context.permissions.includes("places.view");
  const canManage = canRead && context?.permissions.includes("places.manage") === true;

  const [tab, setTab] = useState<PlaceSuggestionStatus>("PENDING");
  const [kind, setKind] = useState<PlaceSuggestionKind | "">("");
  const [data, setData] = useState<{ items: AdminPlaceSuggestionDto[]; counts: Record<PlaceSuggestionStatus, number> } | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Record<string, { lat: string; lng: string }>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setError(null);
    setData(null);
    try {
      setData(await adminPlaceSuggestionsService.queue({ status: tab, kind: kind || undefined }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [canRead, tab, kind]);
  useEffect(() => void load(), [load]);

  async function decide(s: AdminPlaceSuggestionDto, approve: boolean) {
    const note = notes[s.id]?.trim() ?? "";
    if (!approve && note.length < 5) return setMsg({ tone: "bad", text: t("reasonRequired") });
    let pin: { latitude: number; longitude: number } | undefined;
    if (approve && s.kind === "NEW_PLACE" && (s.latitude === null || s.longitude === null)) {
      const lat = Number(pins[s.id]?.lat), lng = Number(pins[s.id]?.lng);
      if (!pins[s.id]?.lat || !pins[s.id]?.lng || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return setMsg({ tone: "bad", text: t("pinRequired") });
      pin = { latitude: lat, longitude: lng };
    }
    setBusy(s.id);
    setMsg(null);
    try {
      if (approve) await adminPlaceSuggestionsService.approve(s.id, { ...(note ? { note } : {}), ...pin });
      else await adminPlaceSuggestionsService.reject(s.id, note);
      setMsg({ tone: "ok", text: approve ? t(s.kind === "NEW_PLACE" ? "approvedNew" : "approvedChange") : t("rejected") });
      await load();
    } catch (e) {
      const code = errorCode(e);
      setMsg({ tone: "bad", text: t.has(`errors.${code}`) ? t(`errors.${code}`) : t("failed") });
    } finally {
      setBusy(null);
    }
  }

  if (status === "idle" || status === "loading") return <Skeleton className="h-64" />;
  if (!canRead || error === "forbidden") return <EmptyState title="places.view" />;
  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel="↻" onRetry={load} />;

  const digits = (v: string | number) => localizeDigits(v, lang);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{t("title")}</h1>
      <p className="text-sm text-text-secondary">{t("hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="tablist" aria-label={t("title")}>
          {STATUSES.map((k) => (
            <Button key={k} size="sm" role="tab" aria-selected={tab === k} variant={tab === k ? "primary" : "ghost"} onClick={() => { setTab(k); setMsg(null); }}>
              {t(`tabs.${k}`)}{data ? ` (${digits(data.counts[k] ?? 0)})` : ""}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>{t("kindFilter")}</span>
          <select className="rounded-md border border-border-subtle bg-transparent px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as PlaceSuggestionKind | "")}>
            <option value="">{t("allKinds")}</option>
            {KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
          </select>
        </label>
      </div>
      {msg ? <p role={msg.tone === "bad" ? "alert" : "status"} className={`text-sm ${msg.tone === "bad" ? "text-state-urgent" : "text-state-success"}`}>{msg.text}</p> : null}

      {!data ? <Skeleton className="h-40" /> : data.items.length === 0 ? <EmptyState title={t(`empty.${tab}`)} /> : (
        <ul className="flex flex-col gap-3">{data.items.map((s) => {
          const hasPin = s.latitude !== null && s.longitude !== null;
          return (
            <li key={s.id}>
              <Panel className="flex flex-col gap-2 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Tag tone={KIND_TONE[s.kind]}>{t(`kinds.${s.kind}`)}</Tag>
                  <strong>{s.name}</strong>
                  <span>· {s.city} · {tPlaces(`category.${s.category}`)}</span>
                  <span className="text-text-secondary">· {t("by", { name: s.member.displayName ?? "—" })} · {formatDay(s.createdAt.slice(0, 10), lang)}</span>
                </p>
                {s.address ? <p>{t("address")}: {s.address}</p> : null}
                {hasPin ? (
                  <p>
                    {t("pin")}: <a className="underline" dir="ltr" href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=18/${s.latitude}/${s.longitude}`} target="_blank" rel="noopener noreferrer">{s.latitude?.toFixed(5)}, {s.longitude?.toFixed(5)}</a>
                  </p>
                ) : s.kind === "NEW_PLACE" ? <p className="text-text-secondary">{t("noPin")}</p> : null}
                {s.notes ? <p className="text-text-secondary">{t("notes")}: {s.notes}</p> : null}

                {s.photos.length ? (
                  <div className="flex flex-wrap gap-2" aria-label={t("photos")}>
                    {s.photos.map((p) => p.url ? (
                      <a key={p.index} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link, not optimisable */}
                        <img src={p.url} alt={t("photoAlt", { n: p.index + 1 })} className="h-24 w-24 rounded-md object-cover" />
                      </a>
                    ) : <span key={p.index} className="text-text-secondary">{t("photoMissing")}</span>)}
                  </div>
                ) : null}

                {s.kind === "CORRECTION" && s.proposedChanges ? (
                  <table className="text-start">
                    <thead><tr><th className="pe-3 text-start">{t("field")}</th><th className="pe-3 text-start">{t("now")}</th><th className="text-start">{t("proposed")}</th></tr></thead>
                    <tbody>{Object.entries(s.proposedChanges).map(([field, value]) => (
                      <tr key={field}><td className="pe-3" dir="ltr">{field}</td><td className="pe-3 text-text-secondary">{String(s.currentValues?.[field] ?? "—")}</td><td>{String(value ?? "—")}</td></tr>
                    ))}</tbody>
                  </table>
                ) : null}
                {s.kind === "CLOSURE_REPORT" ? <p>{t("closureHint")}</p> : null}
                {s.place && s.kind !== "NEW_PLACE" ? <p className="text-text-secondary">{t("aboutPlace", { name: s.place.name, city: s.place.city })} {s.place.listed ? <Tag tone="success">{t("listed")}</Tag> : <Tag>{t("unlisted")}</Tag>}</p> : null}

                {tab === "PENDING" && s.kind === "NEW_PLACE" ? (
                  <section aria-label={t("duplicates")} className="rounded-md border border-border-subtle p-3">
                    <h2 className="mb-1 font-bold">{t("duplicates")}</h2>
                    {s.duplicates.length ? (
                      <ul className="flex flex-col gap-1">{s.duplicates.map((d) => (
                        <li key={d.placeId}>
                          {d.name} · {d.city}
                          {d.distanceMeters !== null ? <> · {t("meters", { n: digits(d.distanceMeters) })}</> : null}
                          {" "}{d.sameName ? <Tag tone="attention">{t("sameName")}</Tag> : null} {d.listed ? <Tag tone="success">{t("listed")}</Tag> : <Tag>{t("unlisted")}</Tag>}
                        </li>
                      ))}</ul>
                    ) : <p className="text-text-secondary">{t("noDuplicates", { m: digits(250) })}</p>}
                    {s.similarPendingIds.length ? <p className="mt-1">{t("similarPending", { count: s.similarPendingIds.length })}</p> : null}
                  </section>
                ) : null}

                {tab !== "PENDING" ? (
                  <p className="text-text-secondary">
                    {t("decidedBy", { name: s.reviewedBy ?? "—" })}{s.reviewedAt ? ` · ${formatDay(s.reviewedAt.slice(0, 10), lang)}` : ""}
                    {s.reviewNote ? <> · {t("reason")}: {s.reviewNote}</> : null}
                    {s.createdPlaceId ? <> · <Link className="underline" href="/admin/places">{t("createdPlace")}</Link></> : null}
                  </p>
                ) : null}

                {canManage && tab === "PENDING" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {s.kind === "NEW_PLACE" && !hasPin ? (
                      <>
                        <Input label={t("latitude")} inputMode="decimal" dir="ltr" value={pins[s.id]?.lat ?? ""} onChange={(e) => setPins({ ...pins, [s.id]: { lat: e.target.value, lng: pins[s.id]?.lng ?? "" } })} />
                        <Input label={t("longitude")} inputMode="decimal" dir="ltr" value={pins[s.id]?.lng ?? ""} onChange={(e) => setPins({ ...pins, [s.id]: { lat: pins[s.id]?.lat ?? "", lng: e.target.value } })} />
                      </>
                    ) : null}
                    <Input label={t("noteLabel")} value={notes[s.id] ?? ""} maxLength={500} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
                    <Button size="sm" disabled={busy !== null} onClick={() => void decide(s, true)}>{t("approve")}</Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void decide(s, false)}>{t("reject")}</Button>
                  </div>
                ) : null}
              </Panel>
            </li>
          );
        })}</ul>
      )}
    </div>
  );
}
