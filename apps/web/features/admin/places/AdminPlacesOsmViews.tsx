"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { adminPlacesOsmService, type OsmSyncAreaDto, type PlaceClaimQueueItemDto } from "@/services/places.service";
import { useAdminStore } from "@/stores/admin-store";
import { EmptyRow, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../console-ui";

type Lang = "fa" | "en" | "de" | "es";

function usePlacesAccess() {
  const context = useAdminStore((state) => state.context);
  const status = useAdminStore((state) => state.status);
  const canRead = status === "ready" && context?.isAdmin === true && context.permissions.includes("places.view");
  const canManage = canRead && context?.permissions.includes("places.manage") === true;
  return { status, canRead, canManage };
}

const RUN_TONE = { RUNNING: "brand", SUCCEEDED: "success", FAILED: "urgent", RATE_LIMITED: "attention" } as const;
const EMPTY_FORM = { city: "", province: "", south: "", west: "", north: "", east: "", active: true };

/** OpenStreetMap seeding: one row per city box, its last weekly run, and a "run now" for staff. */
export function AdminOsmAreasView() {
  const t = useTranslations("adminPlacesOsm");
  const tPlaces = useTranslations("places");
  const lang = useLocale() as Lang;
  const { status, canRead, canManage } = usePlacesAccess();
  const [areas, setAreas] = useState<OsmSyncAreaDto[] | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setError(null);
    try {
      setAreas(await adminPlacesOsmService.areas());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [canRead]);
  useEffect(() => void load(), [load]);

  async function run(area: OsmSyncAreaDto) {
    setBusy(area.id);
    setMsg(null);
    try {
      await adminPlacesOsmService.run(area.id);
      setMsg({ tone: "ok", text: t("started") });
      await load();
    } catch {
      setMsg({ tone: "bad", text: t("runFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function save(input: { city: string; province?: string; south: number; west: number; north: number; east: number; active: boolean }) {
    setBusy("form");
    setMsg(null);
    try {
      setAreas(await adminPlacesOsmService.saveArea(input));
      setMsg({ tone: "ok", text: t("form.saved") });
      return true;
    } catch {
      setMsg({ tone: "bad", text: t("form.saveFailed") });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitForm() {
    const n = (v: string) => Number(v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(",", "."));
    const box = { south: n(form.south), west: n(form.west), north: n(form.north), east: n(form.east) };
    if (!form.city.trim() || Object.values(box).some((v) => !Number.isFinite(v))) return setMsg({ tone: "bad", text: t("form.saveFailed") });
    if (await save({ city: form.city.trim(), province: form.province.trim() || undefined, ...box, active: form.active })) setForm(EMPTY_FORM);
  }

  if (status === "idle" || status === "loading") return <Skeleton className="h-64" />;
  if (!canRead || error === "forbidden") return <EmptyState title="places.view" />;
  if (error) return <ErrorRecovery title={t("osmTitle")} message="" retryLabel="↻" onRetry={load} />;

  const field = (key: "city" | "province" | "south" | "west" | "north" | "east", label: string) => (
    <Input label={label} value={form[key]} dir={key === "city" || key === "province" ? "auto" : "ltr"} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{t("osmTitle")}</h1>
      <p className="text-sm text-text-secondary">{t("osmHint")}</p>
      {msg ? <p role={msg.tone === "bad" ? "alert" : "status"} className={`text-sm ${msg.tone === "bad" ? "text-state-urgent" : "text-state-success"}`}>{msg.text}</p> : null}
      <Panel>
        {!areas ? <Skeleton className="h-40" /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{t("columns.city")}</Th><Th>{t("columns.active")}</Th><Th>{t("columns.listed")}</Th><Th>{t("columns.lastRun")}</Th><Th>{t("columns.result")}</Th><Th>{" "}</Th></tr></thead>
              <tbody>{areas.length === 0 ? <EmptyRow colSpan={6} label="—" /> : areas.map((a) => (
                <tr key={a.id}>
                  <Td><span className="font-bold">{a.city}</span>{a.province ? <span className="text-text-secondary"> · {a.province}</span> : null}</Td>
                  <Td>{a.active ? t("form.yes") : t("form.no")}</Td>
                  <Td>{localizeDigits(String(a.listedPlaces), lang)}</Td>
                  <Td>{a.lastRun ? formatDay(a.lastRun.startedAt.slice(0, 10), lang) : t("never")}</Td>
                  <Td>{a.lastRun ? (
                    <span className="flex flex-col gap-1">
                      <Tag tone={RUN_TONE[a.lastRun.status]}>{t(`status.${a.lastRun.status}`)}</Tag>
                      {a.lastRun.status === "SUCCEEDED" ? <span className="text-metadata text-text-secondary">{localizeDigits(t("result", { created: a.lastRun.created, updated: a.lastRun.updated, hidden: a.lastRun.hidden }), lang)}</span> : null}
                    </span>
                  ) : "—"}</Td>
                  <Td>{canManage ? (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" disabled={busy !== null || a.lastRun?.status === "RUNNING"} onClick={() => void run(a)}>{t("runNow")}</Button>
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void save({ city: a.city, province: a.province ?? undefined, south: a.south, west: a.west, north: a.north, east: a.east, active: !a.active })}>{a.active ? t("form.deactivate") : t("form.activate")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setForm({ city: a.city, province: a.province ?? "", south: String(a.south), west: String(a.west), north: String(a.north), east: String(a.east), active: a.active })}>{t("form.edit")}</Button>
                    </div>
                  ) : null}</Td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
      {canManage ? (
        <Panel>
          <PanelTitle title={t("form.title")} hint={t("form.hint")} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {field("city", t("columns.city"))}
            {field("province", t("form.province"))}
            {field("south", t("form.south"))}
            {field("west", t("form.west"))}
            {field("north", t("form.north"))}
            {field("east", t("form.east"))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{t("columns.active")}</label>
            <Button size="sm" isLoading={busy === "form"} onClick={() => void submitForm()}>{t("form.save")}</Button>
          </div>
        </Panel>
      ) : null}
      <p className="text-metadata text-text-secondary"><a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{tPlaces("osm.attribution")}</a></p>
    </div>
  );
}

/** Business claims on directory listings: approval only for a KYC-verified business, every decision audited with a reason. */
export function AdminPlaceClaimsView() {
  const t = useTranslations("adminPlacesOsm");
  const tPlaces = useTranslations("places");
  const lang = useLocale() as Lang;
  const { status, canRead, canManage } = usePlacesAccess();
  const [tab, setTab] = useState<"PENDING" | "APPROVED">("PENDING");
  const [claims, setClaims] = useState<PlaceClaimQueueItemDto[] | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setError(null);
    setClaims(null);
    try {
      setClaims((await adminPlacesOsmService.claims(tab)).items);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [canRead, tab]);
  useEffect(() => void load(), [load]);

  async function act(claim: PlaceClaimQueueItemDto, action: "approve" | "reject" | "release") {
    const reason = reasons[claim.id]?.trim() ?? "";
    if (reason.length < 3) return setMsg({ tone: "bad", text: t("reason") });
    setBusy(claim.id);
    setMsg(null);
    try {
      if (action === "release") await adminPlacesOsmService.release(claim.place.id, reason);
      else await adminPlacesOsmService.decide(claim.id, action === "approve", reason);
      setMsg({ tone: "ok", text: t("decided") });
      await load();
    } catch {
      setMsg({ tone: "bad", text: action === "release" ? t("releaseFailed") : t("decideFailed") });
    } finally {
      setBusy(null);
    }
  }

  if (status === "idle" || status === "loading") return <Skeleton className="h-64" />;
  if (!canRead || error === "forbidden") return <EmptyState title="places.view" />;
  if (error) return <ErrorRecovery title={t("claimsTitle")} message="" retryLabel="↻" onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{t("claimsTitle")}</h1>
      <p className="text-sm text-text-secondary">{t("claimsHint")}</p>
      <div className="flex gap-2" role="tablist" aria-label={t("claimsTitle")}>
        {(["PENDING", "APPROVED"] as const).map((k) => (
          <Button key={k} size="sm" role="tab" aria-selected={tab === k} variant={tab === k ? "primary" : "ghost"} onClick={() => { setTab(k); setMsg(null); }}>{t(`claimTabs.${k}`)}</Button>
        ))}
      </div>
      {msg ? <p role={msg.tone === "bad" ? "alert" : "status"} className={`text-sm ${msg.tone === "bad" ? "text-state-urgent" : "text-state-success"}`}>{msg.text}</p> : null}
      {!claims ? <Skeleton className="h-40" /> : claims.length === 0 ? <EmptyState title={tab === "PENDING" ? t("claimsEmpty") : t("approvedEmpty")} /> : (
        <ul className="flex flex-col gap-3">{claims.map((c) => {
          const org = c.organization;
          const verified = org?.verificationStatus === "VERIFIED";
          const osmEntries = Object.entries(c.place.osmTags);
          return (
            <li key={c.id}>
              <Panel className="flex flex-col gap-2 text-sm">
                <p>
                  <a className="font-bold underline" href={`/${lang}/places/${c.place.id}`} target="_blank" rel="noopener noreferrer">{c.place.name}</a>
                  {" · "}{c.place.city}{" · "}{tPlaces(`category.${c.place.category}`)}{c.place.source === "OSM" ? <> <Tag tone="brand">OSM</Tag></> : null}
                  {" · "}{formatDay(c.createdAt.slice(0, 10), lang)}
                </p>
                <p>{t("claimColumns.claimant")}: {c.claimant ?? "—"}</p>
                {c.message ? <p className="text-text-secondary">{t("claimColumns.message")}: {c.message}</p> : null}
                <div className="grid gap-3 md:grid-cols-2">
                  <section aria-label={t("compare.business")} className="rounded-md border border-border-subtle p-3">
                    <h2 className="mb-1 font-bold">{t("compare.business")}</h2>
                    {org ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="text-text-secondary">{t("claimColumns.organization")}</dt><dd>{org.name} <Tag tone={verified ? "success" : "attention"}>{verified ? t("kyc.VERIFIED") : t("kyc.other")}</Tag></dd>
                        {org.kycContact ? <><dt className="text-text-secondary">{t("compare.contact")}</dt><dd>{org.kycContact.name} · <span dir="ltr">{org.kycContact.landline}</span></dd></> : null}
                        {org.phone ? <><dt className="text-text-secondary">{t("compare.phone")}</dt><dd dir="ltr">{org.phone}</dd></> : null}
                        {org.address ? <><dt className="text-text-secondary">{t("compare.address")}</dt><dd>{org.address.addressLine}، {org.address.city}{org.address.phone ? <> · <span dir="ltr">{org.address.phone}</span></> : null}</dd></> : null}
                        {org.website ? <><dt className="text-text-secondary">{t("compare.website")}</dt><dd dir="ltr" className="break-all">{org.website}</dd></> : null}
                      </dl>
                    ) : <p className="text-text-secondary">{t("noOrganization")}</p>}
                  </section>
                  <section aria-label={t("compare.listing")} className="rounded-md border border-border-subtle p-3">
                    <h2 className="mb-1 font-bold">{t("compare.listing")}</h2>
                    {osmEntries.length ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{osmEntries.map(([k, v]) => <Fragment key={k}><dt className="text-text-secondary" dir="ltr">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}</dl>
                    ) : (
                      <p className="text-text-secondary">{[c.place.phone, c.place.website, c.place.address].filter(Boolean).join(" · ") || "—"}</p>
                    )}
                  </section>
                </div>
                {c.decisionReason && tab === "APPROVED" ? <p className="text-text-secondary">{t("reason")}: {c.decisionReason}</p> : null}
                {canManage && (tab === "PENDING" || c.place.claimedByThisClaim) ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Input label={t("reason")} value={reasons[c.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })} />
                    {tab === "PENDING" ? (
                      <>
                        <Button size="sm" disabled={!verified || busy !== null} onClick={() => void act(c, "approve")}>{t("approve")}</Button>
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(c, "reject")}>{t("reject")}</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act(c, "release")}>{t("release")}</Button>
                    )}
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
