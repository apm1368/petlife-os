"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SetPetRequestDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatLocaleDate } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { setPetService } from "@/services/set-pet.service";
import { sizeLabel } from "./set-pet-catalog";

/**
 * The member's «ست پت» requests: status, the staff quote (price and promised date) and the two member actions:
 * accept the quote (→ production) or cancel before accepting. Nothing is paid here.
 */
export function SetPetRequests({ refreshKey, highlightId }: { refreshKey: number; highlightId?: string }) {
  const t = useTranslations("setPet.requests");
  const tc = useTranslations("setPet.colours");
  const locale = useLocale() as RouteLocale;
  const [items, setItems] = useState<SetPetRequestDto[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setState("loading");
    setPetService
      .list(signal)
      .then((list) => {
        setItems(list);
        setState("ready");
      })
      .catch(() => {
        if (!signal?.aborted) setState("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  async function act(item: SetPetRequestDto, action: "accept" | "cancel") {
    const id = item.id;
    setBusy(id);
    setActionError(null);
    try {
      // Accept exactly the price the member is looking at; a re-quote in the meantime is refused (409) and reloaded.
      const updated = action === "accept" && item.quote ? await setPetService.acceptQuote(id, item.quote.amountIrr) : await setPetService.cancel(id);
      setItems((list) => list?.map((row) => (row.id === id ? updated : row)) ?? null);
      setConfirmCancel(null);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "SET_PET_QUOTE_CHANGED") {
        const fresh = await setPetService.get(id).catch(() => null);
        if (fresh) setItems((list) => list?.map((row) => (row.id === id ? fresh : row)) ?? null);
        setActionError(t("errors.quoteChanged"));
      } else {
        setActionError(code === "SET_PET_NOT_CANCELLABLE" ? t("errors.notCancellable") : code === "SET_PET_NO_QUOTE" ? t("errors.noQuote") : t("errors.generic"));
      }
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading" && !items) return <p className="setpet-state" role="status">{t("loading")}</p>;
  if (state === "error") {
    return (
      <div className="setpet-state" role="alert">
        <p>{t("loadError")}</p>
        <button type="button" className="opl-btn soft sm" onClick={() => load()}>{t("retry")}</button>
      </div>
    );
  }
  if (!items?.length) return <p className="setpet-state">{t("empty")}</p>;

  return (
    <>
      {actionError ? <p className="setpet-error" role="alert">{actionError}</p> : null}
      <ul className="setpet-requests">
        {items.map((item) => (
          <li key={item.id} className={item.id === highlightId ? "is-new" : undefined}>
            <div className="setpet-requests__head">
              <strong dir="ltr">{item.reference}</strong>
              <span className={`setpet-status setpet-status--${item.status.toLowerCase()}`}>{t(`status.${item.status}`)}</span>
            </div>
            <p>{t("summary", { n: item.humanSizes.length, sizes: item.humanSizes.map(sizeLabel).join(", "), pet: sizeLabel(item.petSize), colour: tc.has(item.humanColour) ? tc(item.humanColour) : item.humanColour })}</p>
            <p className="setpet-requests__meta">{t("sent", { date: formatLocaleDate(item.createdAt, locale) })}</p>
            {item.quote ? (
              <div className="setpet-quote">
                <strong>{t("quote", { amount: formatCurrency(item.quote.amountIrr, locale) })}</strong>
                {item.quote.estimatedReadyAt ? <span>{t("ready", { date: formatLocaleDate(item.quote.estimatedReadyAt, locale) })}</span> : null}
                {item.quote.note ? <p dir="auto">{item.quote.note}</p> : null}
              </div>
            ) : item.status === "SUBMITTED" ? <p className="setpet-requests__meta">{t("waiting")}</p> : null}
            {item.shippingNote && item.status === "SHIPPED" ? <p dir="auto" className="setpet-requests__meta">{item.shippingNote}</p> : null}
            {item.status === "QUOTED" || item.status === "SUBMITTED" ? (
              <div className="setpet-requests__actions">
                {item.status === "QUOTED" ? (
                  <button type="button" className="opl-btn primary sm" disabled={busy === item.id} onClick={() => void act(item, "accept")}>{t("accept")}</button>
                ) : null}
                {confirmCancel === item.id ? (
                  <>
                    <span>{t("cancelConfirm")}</span>
                    <button type="button" className="opl-btn line sm" disabled={busy === item.id} onClick={() => void act(item, "cancel")}>{t("cancelYes")}</button>
                    <button type="button" className="opl-btn soft sm" onClick={() => setConfirmCancel(null)}>{t("cancelNo")}</button>
                  </>
                ) : (
                  <button type="button" className="opl-btn line sm" onClick={() => setConfirmCancel(item.id)}>{t("cancel")}</button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
