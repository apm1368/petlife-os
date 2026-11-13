"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AdminPetTaxiFareRuleDto, AdminPetTaxiOverviewDto } from "@petlife/types";
import { CarFront } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { petTaxiService } from "@/services/pet-taxi.service";
import { useAdminStore } from "@/stores/admin-store";

type Draft = { city: string; base: string; perKm: string; perMinute: string; minimum: string; medium: string; large: string; extraPet: string; south: string; west: string; north: string; east: string; active: boolean };
const toToman = (irr: number) => String(Math.round(irr / 10));
const num = (v: string) => {
  const n = Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const coord = (v: number | null) => (v == null ? "" : String(v));
/** Latitude/longitude as typed (Persian digits and decimal separators accepted); null when empty or not a number. */
const toCoord = (v: string) => {
  const n = Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٫,]/g, ".").trim());
  return v.trim() && Number.isFinite(n) ? n : null;
};
const draftOf = (r: AdminPetTaxiFareRuleDto): Draft => ({ city: r.city, base: toToman(r.baseFareIrr), perKm: toToman(r.perKmIrr), perMinute: toToman(r.perMinuteIrr), minimum: toToman(r.minimumFareIrr), medium: String(r.mediumSurchargePercent), large: String(r.largeSurchargePercent), extraPet: toToman(r.extraPetIrr), south: coord(r.south), west: coord(r.west), north: coord(r.north), east: coord(r.east), active: r.active });
const EMPTY: Draft = { city: "", base: "", perKm: "", perMinute: "0", minimum: "0", medium: "15", large: "35", extraPet: "0", south: "", west: "", north: "", east: "", active: true };

/** /admin/services/pet-taxi — fares per city (Toman in, rials stored) and the last day's rides. */
export function AdminPetTaxiView() {
  const t = useTranslations("adminPetTaxi");
  const locale = useLocale() as RouteLocale;
  const context = useAdminStore((s) => s.context);
  const has = (p: string) => !!context?.permissions?.includes(p as never);
  const [data, setData] = useState<AdminPetTaxiOverviewDto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const d = await petTaxiService.adminOverview();
      setData(d);
      setDrafts(d.rules.map(draftOf));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if ((context && !has("services.view")) || failed === "forbidden")
    return (
      <section className="gx-card" role="alert">
        <h1>{t("title")}</h1>
        <p className="gx-muted">{t("forbidden")}</p>
      </section>
    );
  if (failed === "error")
    return (
      <div className="gx-inline-alert" role="alert">
        <p>{t("failed")}</p>
        <button type="button" className="gx-btn" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data) return <div className="gx-skel" style={{ height: 300 }} aria-label={t("loading")} />;
  const canManage = has("services.manage");
  const money = (irr: number) => formatCurrency(irr, locale);

  async function save(i: number) {
    const d = drafts[i]!;
    if (!d.city.trim()) return setMessage({ ok: false, text: t("saveFailed") });
    const isDefault = d.city.trim() === "*";
    const box = { south: toCoord(d.south), west: toCoord(d.west), north: toCoord(d.north), east: toCoord(d.east) };
    // A city rule prices pickups inside its box; only "*" has none.
    if (!isDefault && Object.values(box).some((v) => v == null)) return setMessage({ ok: false, text: t("boxRequired") });
    setSaving(i);
    setMessage(null);
    try {
      const next = await petTaxiService.adminSaveRule(d.city.trim(), {
        baseFareIrr: num(d.base) * 10,
        perKmIrr: num(d.perKm) * 10,
        perMinuteIrr: num(d.perMinute) * 10,
        minimumFareIrr: num(d.minimum) * 10,
        mediumSurchargePercent: Math.min(300, num(d.medium)),
        largeSurchargePercent: Math.min(300, num(d.large)),
        extraPetIrr: num(d.extraPet) * 10,
        ...(isDefault ? {} : box),
        active: d.active,
        ...(reason.trim().length >= 3 ? { reason: reason.trim() } : {}),
      });
      setData(next);
      setDrafts(next.rules.map(draftOf));
      setMessage({ ok: true, text: t("saved") });
    } catch {
      setMessage({ ok: false, text: t("saveFailed") });
    } finally {
      setSaving(null);
    }
  }

  const field = (i: number, key: keyof Draft, label: string, inputMode: "numeric" | "text" = "numeric") => (
    <label className="gx-field" key={key}>
      <span>{label}</span>
      <input inputMode={inputMode} value={String(drafts[i]![key])} disabled={!canManage || (key === "city" && i < data.rules.length)} onChange={(e) => setDrafts((list) => list.map((d, j) => (j === i ? { ...d, [key]: e.target.value } : d)))} />
    </label>
  );

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <CarFront size={16} aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="gx-kpi">
          <span className="gx-kpi__label">{t("onlineDrivers")}</span>
          <span className="gx-kpi__value">{new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(data.onlineDrivers)}</span>
        </div>
      </header>

      <section className="gx-card">
        <header>
          <h2>{t("rules")}</h2>
          {!canManage ? <p>{t("readOnly")}</p> : null}
        </header>
        {drafts.length === 0 ? <p className="gx-muted">{t("noRules")}</p> : null}
        <div className="gx-grid" style={{ gap: 16 }}>
          {drafts.map((d, i) => (
            <div key={i < data.rules.length ? data.rules[i]!.id : `new-${i}`} className="gx-card" style={{ padding: 16 }}>
              <div className="gx-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
                {field(i, "city", t("fields.city"), "text")}
                {field(i, "base", t("fields.base"))}
                {field(i, "perKm", t("fields.perKm"))}
                {field(i, "perMinute", t("fields.perMinute"))}
                {field(i, "minimum", t("fields.minimum"))}
                {field(i, "medium", t("fields.medium"))}
                {field(i, "large", t("fields.large"))}
                {field(i, "extraPet", t("fields.extraPet"))}
                {d.city.trim() !== "*" ? (
                  <>
                    {field(i, "south", t("fields.south"), "text")}
                    {field(i, "west", t("fields.west"), "text")}
                    {field(i, "north", t("fields.north"), "text")}
                    {field(i, "east", t("fields.east"), "text")}
                  </>
                ) : null}
              </div>
              {d.city.trim() !== "*" ? <p className="gx-muted">{t("boxHint")}</p> : null}
              <div className="gx-toolbar" style={{ marginTop: 10 }}>
                <label className="gx-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={d.active} disabled={!canManage} onChange={(e) => setDrafts((list) => list.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} />
                  <span>{t("fields.active")}</span>
                </label>
                {canManage ? (
                  <button type="button" className="gx-btn gx-btn--primary" disabled={saving !== null} onClick={() => void save(i)}>
                    {t("save")}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {canManage ? (
          <div className="gx-toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="gx-btn" onClick={() => setDrafts((list) => [...list, { ...EMPTY, city: data.rules.some((r) => r.city === "*") ? "" : "*" }])}>
              {t("add")}
            </button>
            <label className="gx-field" style={{ flex: "1 1 260px" }}>
              <span>{t("fields.reason")}</span>
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            </label>
            {message ? (
              <span role={message.ok ? "status" : "alert"} className="gx-muted">
                {message.text}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="gx-card">
        <header>
          <h2>{t("rides")}</h2>
          <p>{t("disputesHint")}</p>
        </header>
        {data.rides.length === 0 ? (
          <p className="gx-empty">{t("noRides")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("columns.member")}</th>
                  <th>{t("columns.driver")}</th>
                  <th>{t("columns.route")}</th>
                  <th className="gx-num">{t("columns.fare")}</th>
                  <th>{t("columns.status")}</th>
                  <th>{t("columns.rating")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rides.map((r) => (
                  <tr key={r.id}>
                    <td>{r.memberName}</td>
                    <td>{r.driverName ?? "—"}</td>
                    <td>
                      {r.pickup.label} → {r.dropoff.label}
                    </td>
                    <td className="gx-num">{money(r.fareIrr)}</td>
                    <td>
                      <span className="gx-tag">{t(`status.${r.status}`)}</span>
                    </td>
                    <td>{r.rating != null ? `★ ${r.rating}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
