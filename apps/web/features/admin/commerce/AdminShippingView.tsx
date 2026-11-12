"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ShipmentStatus,
  ShippingProvider,
  type AdminShipmentListItemDto,
  type AdminShippingMethodDto,
  type AdminShippingOverviewDto,
  type OpetlifeCourierConfig,
  type PaginatedDto,
  type PostPishtazConfig,
} from "@petlife/types";
import { Dialog, PackageCheck } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminShippingService } from "@/services/admin-shipping.service";
import { useAdminStore } from "@/stores/admin-store";
import "./admin-shipping.css";

/** Priced by opetlife's distance/city rules: its own couriers, and Snappbox/Alopeyk booked by staff in their app. */
const COURIER_STYLE: ShippingProvider[] = [ShippingProvider.OPETLIFE_COURIER, ShippingProvider.SNAPPBOX_APP, ShippingProvider.ALOPEYK_APP];
const isCourierStyle = (p: ShippingProvider) => COURIER_STYLE.includes(p);

const STAFF_STATUSES = [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED, ShipmentStatus.FAILED];

/** Staff type Toman; the API stores integer rials. */
const toToman = (irr: number) => String(Math.round(irr / 10));
const toIrr = (toman: string) => {
  const n = Number(toman.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) * 10 : 0;
};
const toNum = (v: string) => {
  const n = Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
  return Number.isFinite(n) ? n : 0;
};

function usePermissions() {
  const context = useAdminStore((s) => s.context);
  return { ready: !!context, has: (p: string) => !!context?.permissions?.includes(p as never) };
}

/** /admin/commerce/shipping — methods offered at checkout with their prices, and every shipment's status. */
export function AdminShippingView() {
  const t = useTranslations("adminShipping");
  const perms = usePermissions();
  const [overview, setOverview] = useState<AdminShippingOverviewDto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setOverview(await adminShippingService.methods());
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("commerce.view")) || failed === "forbidden")
    return (
      <section className="gx-card" role="alert">
        <h1>{t("title")}</h1>
        <p className="gx-muted">{t("forbidden")}</p>
      </section>
    );
  const canManage = perms.has("commerce.manage");

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <PackageCheck size={16} aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      {failed === "error" ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("failed")}</p>
          <button type="button" className="gx-btn" onClick={() => void load()}>
            {t("retry")}
          </button>
        </div>
      ) : !overview ? (
        <div className="gx-skel" style={{ height: 260 }} aria-label={t("loading")} />
      ) : (
        <>
          <p className="gx-inline-note">{t(`mode.${overview.mode}`)}</p>
          {!canManage ? <p className="gx-muted">{t("readOnly")}</p> : null}
          <div className="gx-grid as-methods">
            {overview.methods.map((m) => (
              <MethodCard key={m.provider} method={m} canManage={canManage} onSaved={setOverview} />
            ))}
          </div>
        </>
      )}
      <ShipmentsPanel canManage={canManage} />
    </div>
  );
}

function MethodCard({ method, canManage, onSaved }: { method: AdminShippingMethodDto; canManage: boolean; onSaved: (o: AdminShippingOverviewDto) => void }) {
  const t = useTranslations("adminShipping");
  const [enabled, setEnabled] = useState(method.enabled);
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(method));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (key: string, label: string, inputMode: "numeric" | "decimal" | "text" = "numeric") => (
    <label className="gx-field" key={key}>
      <span>{label}</span>
      <input inputMode={inputMode} value={form[key] ?? ""} disabled={!canManage} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const config = isCourierStyle(method.provider) ? courierFromForm(form) : method.provider === ShippingProvider.POST_PISHTAZ ? postFromForm(form) : undefined;
      onSaved(await adminShippingService.updateMethod(method.provider, { enabled, config, reason: reason.trim() || undefined }));
      setMessage({ ok: true, text: t("saved") });
      setReason("");
    } catch {
      setMessage({ ok: false, text: t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gx-card">
      <header>
        <h2>{t(`provider.${method.provider}`)}</h2>
        <span className={`gx-tag ${method.active ? "as-on" : ""}`}>{method.active ? t("active") : t("inactive")}</span>
      </header>
      <p className="gx-muted">
        {t(`kind.${method.kind}`)}
        {method.note ? ` · ${t(`notes.${method.note}` as "notes.SANDBOX")}` : ""}
      </p>
      {method.webhookSecretConfigured !== null ? <p className="gx-muted">{method.webhookSecretConfigured ? t("webhook.yes") : t("webhook.no")}</p> : null}
      <label className="as-switch">
        <input type="checkbox" checked={enabled} disabled={!canManage} onChange={(e) => setEnabled(e.target.checked)} /> {t("enabled")}
      </label>
      {method.provider === ShippingProvider.SNAPPBOX_APP || method.provider === ShippingProvider.ALOPEYK_APP ? <p className="gx-muted">{t("appCourierHint")}</p> : null}
      {isCourierStyle(method.provider) ? (
        <div className="as-form">
          {field("cities", t("courier.cities"), "text")}
          <div className="as-row">
            {field("baseFare", t("courier.baseFare"))}
            {field("perKm", t("courier.perKm"))}
            {field("minFare", t("courier.minFare"))}
            {field("maxKm", t("courier.maxKm"), "decimal")}
            {field("roadFactor", t("courier.roadFactor"), "decimal")}
            {field("defaultFlat", t("courier.defaultFlat"))}
            {field("pickupMinutes", t("courier.pickupMinutes"))}
            {field("minutesPerKm", t("courier.minutesPerKm"), "decimal")}
          </div>
          <label className="gx-field">
            <span>{t("courier.cityFares")}</span>
            <textarea rows={3} value={form.cityFares ?? ""} disabled={!canManage} onChange={(e) => setForm((f) => ({ ...f, cityFares: e.target.value }))} />
          </label>
        </div>
      ) : null}
      {method.provider === ShippingProvider.POST_PISHTAZ ? (
        <div className="as-form as-row">
          {field("fixedPrice", t("post.fixedPrice"))}
          {field("includedKg", t("post.includedKg"), "decimal")}
          {field("perExtraKg", t("post.perExtraKg"))}
          {field("etaMin", t("post.etaMin"))}
          {field("etaMax", t("post.etaMax"))}
        </div>
      ) : null}
      {canManage ? (
        <div className="as-form">
          <label className="gx-field">
            <span>{t("reason")}</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="gx-toolbar">
            <button type="button" className="gx-btn gx-btn--primary" disabled={busy} onClick={() => void save()}>
              {busy ? t("saving") : t("save")}
            </button>
            {message ? (
              <span role={message.ok ? "status" : "alert"} className={message.ok ? "gx-muted" : "as-error"}>
                {message.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function initialForm(m: AdminShippingMethodDto): Record<string, string> {
  if (isCourierStyle(m.provider)) {
    const c = m.config as OpetlifeCourierConfig;
    return {
      cities: c.cities.join("، "),
      baseFare: toToman(c.baseFareIrr),
      perKm: toToman(c.perKmIrr),
      minFare: toToman(c.minFareIrr),
      maxKm: String(c.maxKm),
      roadFactor: String(c.roadFactor),
      defaultFlat: toToman(c.defaultFlatFareIrr),
      pickupMinutes: String(c.pickupMinutes),
      minutesPerKm: String(c.minutesPerKm),
      cityFares: Object.entries(c.cityFlatFareIrr).map(([city, irr]) => `${city}=${toToman(irr)}`).join("\n"),
    };
  }
  if (m.provider === ShippingProvider.POST_PISHTAZ) {
    const c = m.config as PostPishtazConfig;
    return { fixedPrice: toToman(c.fixedPriceIrr), includedKg: String(c.includedKg), perExtraKg: toToman(c.perExtraKgIrr), etaMin: String(c.etaDaysMin), etaMax: String(c.etaDaysMax) };
  }
  return {};
}

function courierFromForm(f: Record<string, string>): OpetlifeCourierConfig {
  const cityFlatFareIrr: Record<string, number> = {};
  for (const line of (f.cityFares ?? "").split("\n")) {
    const [city, fare] = line.split("=");
    if (city?.trim() && fare?.trim()) cityFlatFareIrr[city.trim()] = toIrr(fare);
  }
  return {
    cities: (f.cities ?? "").split(/[,،]/).map((c) => c.trim()).filter(Boolean),
    baseFareIrr: toIrr(f.baseFare ?? "0"),
    perKmIrr: toIrr(f.perKm ?? "0"),
    minFareIrr: toIrr(f.minFare ?? "0"),
    maxKm: toNum(f.maxKm ?? "40"),
    roadFactor: toNum(f.roadFactor ?? "1.3"),
    cityFlatFareIrr,
    defaultFlatFareIrr: toIrr(f.defaultFlat ?? "0"),
    pickupMinutes: Math.round(toNum(f.pickupMinutes ?? "45")),
    minutesPerKm: toNum(f.minutesPerKm ?? "4"),
  };
}

function postFromForm(f: Record<string, string>): PostPishtazConfig {
  return {
    fixedPriceIrr: toIrr(f.fixedPrice ?? "0"),
    includedKg: toNum(f.includedKg ?? "1"),
    perExtraKgIrr: toIrr(f.perExtraKg ?? "0"),
    etaDaysMin: Math.round(toNum(f.etaMin ?? "2")),
    etaDaysMax: Math.round(toNum(f.etaMax ?? "5")),
  };
}

function ShipmentsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("adminShipping");
  const locale = useLocale() as RouteLocale;
  const [provider, setProvider] = useState<ShippingProvider | "">("");
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [data, setData] = useState<PaginatedDto<AdminShipmentListItemDto> | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<AdminShipmentListItemDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso));

  const load = useCallback(async () => {
    setFailed(false);
    setData(null);
    try {
      setData(await adminShippingService.shipments({ provider: provider || undefined, status: status || undefined }));
    } catch {
      setFailed(true);
    }
  }, [provider, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="gx-card">
      <header>
        <h2>{t("shipments.title")}</h2>
        <p>{t("shipments.hint")}</p>
      </header>
      {notice ? (
        <p className="gx-inline-note" role="status">
          {notice}
        </p>
      ) : null}
      <div className="gx-toolbar">
        <label className="gx-field">
          <span>{t("shipments.columns.method")}</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as ShippingProvider | "")}>
            <option value="">{t("shipments.allMethods")}</option>
            {Object.values(ShippingProvider).map((p) => (
              <option key={p} value={p}>
                {t(`provider.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="gx-field">
          <span>{t("shipments.columns.status")}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | "")}>
            <option value="">{t("shipments.allStatuses")}</option>
            {Object.values(ShipmentStatus).map((s) => (
              <option key={s} value={s}>
                {t(`shipments.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {failed ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("failed")}</p>
          <button type="button" className="gx-btn" onClick={() => void load()}>
            {t("retry")}
          </button>
        </div>
      ) : !data ? (
        <div className="gx-skel" style={{ height: 160 }} aria-label={t("loading")} />
      ) : data.items.length === 0 ? (
        <p className="gx-empty">{t("shipments.empty")}</p>
      ) : (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead>
              <tr>
                <th>{t("shipments.columns.method")}</th>
                <th>{t("shipments.columns.seller")}</th>
                <th>{t("shipments.columns.city")}</th>
                <th>{t("shipments.columns.status")}</th>
                <th>{t("shipments.columns.tracking")}</th>
                <th>{t("shipments.columns.updated")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id}>
                  <td>{t(`provider.${s.provider}`)}</td>
                  <td>{s.sellerName}</td>
                  <td>{s.deliveryCity ?? "—"}</td>
                  <td>
                    <span className="gx-tag">{t(`shipments.status.${s.status}`)}</span>
                  </td>
                  <td dir="ltr">{s.trackingCode ?? "—"}</td>
                  <td>{date(s.updatedAt)}</td>
                  <td>
                    {s.staffManaged && canManage && s.status !== ShipmentStatus.DELIVERED && s.status !== ShipmentStatus.CANCELED ? (
                      <button type="button" className="gx-btn" onClick={() => setEditing(s)}>
                        {t("shipments.update")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <ShipmentDialog
          shipment={editing}
          onClose={() => setEditing(null)}
          onDone={(applied) => {
            setEditing(null);
            setNotice(applied ? t("shipments.applied") : t("shipments.notApplied"));
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function ShipmentDialog({ shipment, onClose, onDone }: { shipment: AdminShipmentListItemDto; onClose: () => void; onDone: (applied: boolean) => void }) {
  const t = useTranslations("adminShipping");
  const [status, setStatus] = useState<ShipmentStatus>(ShipmentStatus.IN_TRANSIT);
  const [tracking, setTracking] = useState(shipment.trackingCode ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const result = await adminShippingService.updateShipment(shipment.id, { status, trackingCode: tracking.trim() || undefined, note: note.trim() || undefined });
      onDone(result.applied);
    } catch {
      setError(t("shipments.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("shipments.updateTitle")}>
      <div className="as-form">
        <p className="gx-muted">
          {t(`provider.${shipment.provider}`)} · {shipment.sellerName}
        </p>
        <label className="gx-field">
          <span>{t("shipments.newStatus")}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)}>
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`shipments.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="gx-field">
          <span>{t("shipments.trackingCode")}</span>
          <input dir="ltr" value={tracking} maxLength={300} onChange={(e) => setTracking(e.target.value)} />
        </label>
        <label className="gx-field">
          <span>{t("shipments.note")}</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? (
          <p className="as-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gx-toolbar">
          <button type="button" className="gx-btn gx-btn--primary" disabled={busy} onClick={() => void apply()}>
            {t("shipments.apply")}
          </button>
          <button type="button" className="gx-btn" onClick={onClose}>
            {t("shipments.cancel")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
