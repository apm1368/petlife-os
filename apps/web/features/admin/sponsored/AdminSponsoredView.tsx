"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { AdminSponsoredCampaignDetailDto, AdminSponsoredCampaignDto, AdminSponsoredRateDto, PaginatedDto, SponsoredCampaignStatusValue } from "@petlife/types";
import { Search, Wallet } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { sponsoredService } from "@/services/sponsored.service";
import { useAdminStore } from "@/stores/admin-store";
import "../wallets/admin-wallets.css";

const STATUSES: (SponsoredCampaignStatusValue | "ALL")[] = ["ACTIVE", "PAUSED", "STOPPED", "ALL"];

function usePerms() {
  const context = useAdminStore((s) => s.context);
  return { ready: !!context, has: (p: string) => !!context?.permissions?.includes(p as never) };
}

function useFormat() {
  const locale = useLocale() as RouteLocale;
  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const date = useCallback(
    (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso)) : "—"),
    [locale],
  );
  return { locale, money, date };
}

function tomanToRial(raw: string): number | null {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬،]/g, "");
  return /^\d{1,9}$/.test(latin) ? Number(latin) * 10 : null;
}

/** The flat price per click: current, scheduled, history; a new price for settings.manage. */
function RateCard() {
  const t = useTranslations("adminSponsored");
  const { money, date } = useFormat();
  const perms = usePerms();
  const [rate, setRate] = useState<AdminSponsoredRateDto | null>(null);
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRate(await sponsoredService.admin.rate());
    } catch {
      setRate(null);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rial = tomanToRial(price);
    if (rial === null || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      setRate(await sponsoredService.admin.setRate({ rateIrr: rial, effectiveFrom: from ? new Date(from).toISOString() : undefined, reason: reason.trim() }));
      setPrice("");
      setFrom("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? t("errors.forbidden") : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (!rate) return null;
  return (
    <section className="gx-card" aria-labelledby="spn-rate">
      <h2 id="spn-rate">{t("rate.title")}</h2>
      <p>
        <strong>{t("rate.current", { price: money(rate.currentIrr) })}</strong>
        {rate.next ? ` · ${t("rate.next", { price: money(rate.next.rateIrr), date: date(rate.next.effectiveFrom) })}` : ""}
      </p>
      <p className="gx-muted">{t("rate.hint")}</p>
      {perms.has("settings.manage") ? (
        <form className="aw-form" onSubmit={submit}>
          <div className="aw-form__row">
            <label className="gx-field"><span>{t("rate.newPrice")}</span><input inputMode="numeric" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} required /></label>
            <label className="gx-field"><span>{t("rate.from")}</span><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="gx-field"><span>{t("reason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required /></label>
          </div>
          <div className="gx-toolbar"><button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{t("rate.save")}</button></div>
          {error ? <p className="aw-error" role="alert">{error}</p> : null}
        </form>
      ) : null}
      {rate.history.length ? (
        <ul className="aw-list">
          {rate.history.map((h) => (
            <li key={h.id}>
              <strong>{money(h.rateIrr)}</strong>
              <small>{t("rate.historyLine", { date: date(h.effectiveFrom), by: h.setBy, reason: h.reason })}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** One campaign's click log, with crediting back invalid billed clicks for wallet.adjust. */
function CampaignClicks({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useTranslations("adminSponsored");
  const { money, date } = useFormat();
  const perms = usePerms();
  const [data, setData] = useState<AdminSponsoredCampaignDetailDto | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => setData(await sponsoredService.admin.campaign(id)), [id]);
  useEffect(() => void load().catch(() => setData(null)), [load]);

  async function refund() {
    setMessage(null);
    try {
      const r = await sponsoredService.admin.refund(picked, reason.trim());
      setMessage(t("clicks.refunded", { count: r.refunded, amount: money(r.amountIrr) }));
      setPicked([]);
      setReason("");
      await load();
      onChanged();
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 403 ? t("errors.forbidden") : t("errors.generic"));
    }
  }

  if (!data) return <div className="gx-skel" style={{ height: 80 }} />;
  const canRefund = perms.has("wallet.adjust");
  return (
    <div className="aw-clicks">
      {data.clicks.length === 0 ? (
        <p className="gx-muted">{t("clicks.empty")}</p>
      ) : (
        <ul className="aw-list">
          {data.clicks.map((c) => (
            <li key={c.id}>
              <label className="aw-click">
                {canRefund && c.outcome === "BILLED" && !c.invalidatedAt ? (
                  <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                ) : null}
                <span>
                  {date(c.clickedAt)} · {t(`clicks.outcome.${c.outcome}`)} · {c.costIrr ? money(c.costIrr) : "—"} · {t(`clicks.viewer.${c.viewer}`)}
                  {c.invalidatedAt ? ` · ${t("clicks.refundedLine", { reason: c.invalidReason ?? "" })}` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {canRefund && picked.length ? (
        <div className="aw-form__row">
          <label className="gx-field"><span>{t("reason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} /></label>
          <button type="button" className="gx-btn gx-btn--primary" disabled={reason.trim().length < 5} onClick={() => void refund()}>{t("clicks.refund", { count: picked.length })}</button>
        </div>
      ) : null}
      {message ? <p className="gx-muted" role="status">{message}</p> : null}
    </div>
  );
}

/** /admin/commerce/sponsored — every sponsored campaign with its spend, staff holds/stops, refunds and the price. */
export function AdminSponsoredView() {
  const t = useTranslations("adminSponsored");
  const { locale, money } = useFormat();
  const perms = usePerms();
  const [status, setStatus] = useState<SponsoredCampaignStatusValue | "ALL">("ACTIVE");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminSponsoredCampaignDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; action: "hold" | "stop" } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await sponsoredService.admin.campaigns({ status: status === "ALL" ? undefined : status, q: query || undefined, page }));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [status, query, page]);
  useEffect(() => void load(), [load]);

  async function moderate(id: string, action: "hold" | "release" | "stop", why?: string) {
    try {
      await sponsoredService.admin.moderate(id, action, why);
      setActing(null);
      setReason("");
      await load();
    } catch {
      setFailed("error");
    }
  }

  if ((perms.ready && !perms.has("promotions.manage")) || failed === "forbidden") {
    return (
      <section className="gx-card" role="alert">
        <h1>{t("title")}</h1>
        <p className="gx-muted">{t("forbidden")}</p>
      </section>
    );
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><Wallet size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      <RateCard />
      <section className="gx-card">
        <div className="gx-toolbar" role="tablist" aria-label={t("filter")}>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={`gx-btn ${status === s ? "gx-btn--primary" : ""}`} onClick={() => { setStatus(s); setPage(1); }}>
              {t(`status.${s}`)}
            </button>
          ))}
        </div>
        <form className="gx-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
          <label className="gx-field aw-search"><span>{t("search")}</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} /></label>
          <button type="submit" className="gx-btn"><Search size={16} aria-hidden="true" />{t("searchButton")}</button>
        </form>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert"><p>{t("errors.generic")}</p><button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button></div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 200 }} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{t("empty")}</p>
        ) : (
          <ul className="aw-list aw-transfers">
            {data.items.map((c) => (
              <li key={c.id}>
                <div className="aw-transfer__head">
                  <strong>{c.target.title}</strong>
                  <span className={`gx-tag aw-status aw-status--${c.serving ? "ACTIVE" : c.status === "STOPPED" ? "REJECTED" : "PENDING"}`}>{c.serving ? t("serving") : t(`notServing.${c.notServingReason ?? "PAUSED"}`)}</span>
                  <span className="gx-tag">{t(`placement.${c.placement}`)}</span>
                </div>
                <small>
                  <Link href={`/${locale}/admin/wallets/accounts/${c.owner.walletAccountId}`}>{c.owner.name}</Link> · {t("limits", { budget: money(c.dailyBudgetIrr), ceiling: money(c.maxCpcIrr) })}
                </small>
                <small>{t("spend", { today: money(c.today.spentIrr), todayClicks: c.today.billedClicks, total: money(c.total.spentIrr), totalClicks: c.total.billedClicks, free: c.total.freeClicks, refunded: money(c.total.refundedIrr) })}</small>
                {c.staffHoldReason ? <small>{t("heldBecause", { reason: c.staffHoldReason })}</small> : null}
                <div className="gx-toolbar aw-request-actions">
                  <button type="button" className="gx-btn" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? t("hideClicks") : t("showClicks")}</button>
                  {c.status !== "STOPPED" ? (
                    <>
                      {c.staffHoldReason ? (
                        <button type="button" className="gx-btn" onClick={() => void moderate(c.id, "release")}>{t("release")}</button>
                      ) : (
                        <button type="button" className="gx-btn" onClick={() => setActing({ id: c.id, action: "hold" })}>{t("hold")}</button>
                      )}
                      <button type="button" className="gx-btn" onClick={() => setActing({ id: c.id, action: "stop" })}>{t("stop")}</button>
                    </>
                  ) : null}
                </div>
                {acting?.id === c.id ? (
                  <form className="gx-toolbar" onSubmit={(e) => { e.preventDefault(); void moderate(c.id, acting.action, reason.trim()); }}>
                    <label className="gx-field"><span>{t("reason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required /></label>
                    <button type="submit" className="gx-btn gx-btn--primary" disabled={reason.trim().length < 5}>{acting.action === "hold" ? t("hold") : t("stop")}</button>
                    <button type="button" className="gx-btn" onClick={() => setActing(null)}>{t("cancel")}</button>
                  </form>
                ) : null}
                {open === c.id ? <CampaignClicks id={c.id} onChanged={load} /> : null}
              </li>
            ))}
          </ul>
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar aw-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("next")}</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
