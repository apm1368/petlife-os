"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SponsoredCampaignDto, SponsoredOverviewDto, SponsoredTargetDto } from "@petlife/types";
import { Button } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { sponsoredService } from "@/services/sponsored.service";
import "./sponsored.css";

/** Toman typed with Latin, Persian or Arabic-Indic digits and separators → a whole number, or null. */
function parseToman(raw: string): number | null {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,\s٬،.]/g, "");
  return /^\d{1,12}$/.test(latin) ? Number(latin) : null;
}

/**
 * A partner's sponsored listings, on the organisation's business wallet page: the flat price per click, each
 * campaign's spend today and in total and why it isn't showing, and creating / limiting / pausing / stopping one.
 */
export function SponsoredCampaignsPanel({ accountId }: { accountId: string }) {
  const t = useTranslations("sponsored.partner");
  const locale = useLocale() as RouteLocale;
  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const [data, setData] = useState<SponsoredOverviewDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [targets, setTargets] = useState<SponsoredTargetDto[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [budget, setBudget] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await sponsoredService.overview(accountId));
    } catch {
      setFailed(true);
    }
  }, [accountId]);
  useEffect(() => void load(), [load]);

  async function openForm() {
    setError(null);
    try {
      const list = await sponsoredService.targets(accountId);
      setTargets(list);
      setTargetId(list.find((x) => !x.live)?.id ?? "");
      if (data && !ceiling) setCeiling(String(Math.round(data.rate.currentIrr / 10)));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function reasonText(err: unknown): string {
    const reason = err instanceof ApiError ? String((err.details as { reason?: string } | undefined)?.reason ?? "") : "";
    return reason && t.has(`errors.${reason}`) ? t(`errors.${reason}`) : t("errors.generic");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const target = targets?.find((x) => x.id === targetId);
    const daily = parseToman(budget);
    const max = parseToman(ceiling);
    if (!target || daily === null || max === null) {
      setError(t("errors.OUT_OF_RANGE"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sponsoredService.create(accountId, { placement: target.placement, productId: target.kind === "PRODUCT" ? target.id : undefined, dailyBudgetIrr: daily * 10, maxCpcIrr: max * 10 });
      setTargets(null);
      setBudget("");
      await load();
    } catch (err) {
      setError(reasonText(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(c: SponsoredCampaignDto, action: "pause" | "resume" | "stop") {
    if (action === "stop" && !window.confirm(t("confirmStop"))) return;
    setBusy(true);
    setError(null);
    try {
      await sponsoredService.setStatus(accountId, c.id, action);
      await load();
    } catch (err) {
      setError(reasonText(err));
    } finally {
      setBusy(false);
    }
  }

  if (failed) return null;
  if (!data) return null;

  return (
    <section className="wallet-section spn-panel" aria-labelledby="spn-partner">
      <div className="account-section-title">
        <h2 id="spn-partner">{t("title")}</h2>
      </div>
      <p className="spn-panel__price">
        {t("price", { price: money(data.rate.currentIrr) })}
        {data.rate.next ? ` ${t("nextPrice", { price: money(data.rate.next.rateIrr), date: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(data.rate.next.effectiveFrom)) })}` : ""}
      </p>
      <p className="spn-panel__rules">{t("rules")}</p>
      {!data.enabled ? <p className="spn-panel__notice" role="status">{t("switchedOff")}</p> : null}
      {!data.verified ? <p className="spn-panel__notice" role="status">{t("notVerified")}</p> : null}

      {data.campaigns.length ? (
        <ul className="spn-panel__list">
          {data.campaigns.map((c) => (
            <li key={c.id}>
              <div className="spn-panel__head">
                <strong>{c.target.title}</strong>
                <span className="spn-panel__state">{c.serving ? t("serving") : t(`notServing.${c.notServingReason ?? "PAUSED"}`)}</span>
              </div>
              <small>
                {t(`placement.${c.placement}`)} · {t("limits", { budget: money(c.dailyBudgetIrr), ceiling: money(c.maxCpcIrr) })}
              </small>
              <small>{t("today", { spent: money(c.today.spentIrr), clicks: c.today.billedClicks, free: c.today.freeClicks })}</small>
              <small>{t("total", { spent: money(c.total.spentIrr), clicks: c.total.billedClicks, refunded: money(c.total.refundedIrr) })}</small>
              {c.staffHoldReason ? <small>{t("heldBecause", { reason: c.staffHoldReason })}</small> : null}
              {c.status !== "STOPPED" ? (
                <div className="spn-panel__actions">
                  {c.status === "ACTIVE" ? <Button variant="secondary" disabled={busy} onClick={() => void act(c, "pause")}>{t("pause")}</Button> : <Button variant="secondary" disabled={busy} onClick={() => void act(c, "resume")}>{t("resume")}</Button>}
                  <Button variant="secondary" disabled={busy} onClick={() => void act(c, "stop")}>{t("stop")}</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="spn-panel__empty">{t("empty")}</p>
      )}

      {data.enabled && data.verified ? (
        targets ? (
          <form className="spn-panel__form" onSubmit={create}>
            {targets.length ? (
              <>
                <label>
                  <span>{t("form.target")}</span>
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
                    {targets.map((x) => (
                      <option key={x.id} value={x.id} disabled={x.live}>
                        {x.title}
                        {x.live ? ` (${t("form.alreadyLive")})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("form.budget")}</span>
                  <input inputMode="numeric" dir="ltr" value={budget} onChange={(e) => setBudget(e.target.value)} required />
                </label>
                <label>
                  <span>{t("form.ceiling")}</span>
                  <input inputMode="numeric" dir="ltr" value={ceiling} onChange={(e) => setCeiling(e.target.value)} required />
                  <small>{t("form.ceilingHint")}</small>
                </label>
                <div className="spn-panel__actions">
                  <Button type="submit" disabled={busy || !targetId}>{t("form.submit")}</Button>
                  <Button type="button" variant="secondary" onClick={() => setTargets(null)}>{t("form.cancel")}</Button>
                </div>
              </>
            ) : (
              <p>{t("form.noTargets")}</p>
            )}
          </form>
        ) : (
          <Button variant="secondary" onClick={() => void openForm()}>{t("new")}</Button>
        )
      ) : null}
      {error ? <p className="spn-panel__error" role="alert">{error}</p> : null}
    </section>
  );
}
