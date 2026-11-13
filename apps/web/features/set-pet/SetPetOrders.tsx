"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { CustomerAddressDto, SetPetRequestDto, SetPetShippingOptionDto } from "@petlife/types";
import { CircleAlert, RotateCcw } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatLocaleDate, formatLocaleNumber } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { setPetService } from "@/services/set-pet.service";
import { householdsService } from "@/services/households.service";
import { addressesService } from "@/services/addresses.service";
import { walletService } from "@/services/wallet.service";
import { sizeLabel } from "./set-pet-catalog";

/** The proof image the member is asked to approve: a short-lived same-origin link, shown only as <img>. */
function ProofImage({ order }: { order: SetPetRequestDto }) {
  const t = useTranslations("setPet.orders");
  const [url, setUrl] = useState<string | null>(null);
  const proofId = order.proof?.id;
  useEffect(() => {
    if (!proofId) return;
    let cancelled = false;
    setPetService.proof(order.id).then((r) => {
      if (!cancelled && (r.url.startsWith("/") || r.url.startsWith(window.location.origin))) setUrl(r.url);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [order.id, proofId]);
  if (!url) return <p className="setpet-note">{t("proofLoading")}</p>;
  // eslint-disable-next-line @next/next/no-img-element -- a short-lived same-origin link to a checked raster proof
  return <img className="setpet-proof" src={url} alt={t("proofAlt", { reference: order.reference })} draggable={false} onContextMenu={(e) => e.preventDefault()} />;
}

/** Pay in full from the wallet (owner F2/F3), with delivery by one of the shop's methods (F7). */
function PayPanel({ order, onPaid }: { order: SetPetRequestDto; onPaid: (o: SetPetRequestDto) => void }) {
  const t = useTranslations("setPet.orders.pay");
  const tp = useTranslations("setPet.shipping");
  const locale = useLocale() as RouteLocale;
  const money = (irr: number) => formatCurrency(irr, locale);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [addressId, setAddressId] = useState("");
  const [shipping, setShipping] = useState<SetPetShippingOptionDto[] | null>(null);
  const [provider, setProvider] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const households = await householdsService.listMine();
        const lists = await Promise.all(households.map((h) => addressesService.list(h.id)));
        const all = lists.flat();
        setAddresses(all);
        setAddressId((current) => current || (all.find((a) => a.isDefault) ?? all[0])?.id || "");
      } catch {
        setAddresses([]);
      }
    })();
    walletService.summary().then((w) => setBalance(w.balances.total)).catch(() => setBalance(null));
  }, []);

  useEffect(() => {
    if (!addressId) return;
    const controller = new AbortController();
    setShipping(null);
    setPetService.shippingOptions(order.id, addressId, controller.signal).then((list) => {
      setShipping(list);
      setProvider((current) => (list.some((o) => o.provider === current) ? current : list[0]?.provider ?? ""));
    }).catch(() => {
      if (!controller.signal.aborted) setShipping([]);
    });
    return () => controller.abort();
  }, [order.id, addressId]);

  const option = shipping?.find((o) => o.provider === provider);
  const total = option ? order.price.totalIrr + option.priceIrr : null;
  const short = total != null && balance != null && balance < total ? total - balance : 0;

  async function pay() {
    if (!option || total == null) return;
    setBusy(true);
    setError(null);
    try {
      onPaid(await setPetService.pay(order.id, { addressId, shippingProvider: option.provider, expectedTotalIrr: total }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      const reason = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      setError(reason === "INSUFFICIENT_WALLET_BALANCE" ? t("errors.balance") : code === "SET_PET_TOTAL_CHANGED" ? t("errors.changed") : t("errors.generic"));
      walletService.summary().then((w) => setBalance(w.balances.total)).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (addresses === null) return <p className="setpet-note">{t("loading")}</p>;
  return (
    <div className="setpet-pay">
      <h4>{t("title")}</h4>
      {addresses.length ? (
        <label className="setpet-field">
          <span>{t("address")}</span>
          <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
            {addresses.map((a) => <option key={a.id} value={a.id}>{[a.label, a.city, a.addressLine].filter(Boolean).join("، ")}</option>)}
          </select>
        </label>
      ) : (
        <p className="setpet-note">{t("noAddress")} <Link href={`/${locale}/profile`}>{t("addAddress")}</Link></p>
      )}
      {addressId ? (
        shipping === null ? <p className="setpet-note">{t("shippingLoading")}</p>
        : shipping.length ? (
          <fieldset className="setpet-ship">
            <legend>{t("shipping")}</legend>
            {shipping.map((o) => (
              <label key={o.provider} className={o.provider === provider ? "is-on" : undefined}>
                <input type="radio" name={`ship-${order.id}`} checked={o.provider === provider} onChange={() => setProvider(o.provider)} />
                <span>{tp(o.provider)}</span>
                {o.provider === "STAFF_ARRANGED" ? <span /> : <strong>{money(o.priceIrr)}</strong>}
                {o.etaDays ? <small>{t("eta", { days: formatLocaleNumber(o.etaDays, locale) })}</small> : null}
              </label>
            ))}
          </fieldset>
        ) : <p className="setpet-warn"><CircleAlert size={16} aria-hidden="true" />{t("noShipping")}</p>
      ) : null}
      {total != null ? (
        <table className="setpet-price">
          <tbody>
            <tr><th scope="row">{t("items")}</th><td>{money(order.price.totalIrr)}</td></tr>
            <tr><th scope="row">{t("delivery")}</th><td>{money(option!.priceIrr)}</td></tr>
            <tr className="is-total"><th scope="row">{t("total")}</th><td>{money(total)}</td></tr>
          </tbody>
        </table>
      ) : null}
      {balance != null ? <p className="setpet-note">{t("balance", { amount: money(balance) })}</p> : null}
      {short > 0 ? (
        <p className="setpet-warn">
          <CircleAlert size={16} aria-hidden="true" />
          {t("topUpNeeded", { amount: money(short) })} <Link href={`/${locale}/profile/wallet`}>{t("topUp")}</Link>
        </p>
      ) : null}
      {error ? <p className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p> : null}
      <button type="button" className="opl-btn primary sm" disabled={busy || total == null || short > 0} onClick={() => void pay()}>
        {busy ? t("paying") : total != null ? t("cta", { amount: money(total) }) : t("ctaPlain")}
      </button>
    </div>
  );
}

/**
 * The member's «ست پت» orders (owner P38: their own section), newest first: where each one is, the print proof to
 * approve, the payment, the ready date and delivery, and the member's actions — edit until the proof is approved
 * (P39), cancel free until printing starts (F8), reorder in one click (P40).
 */
export function SetPetOrders({ refreshKey = 0, focusId }: { refreshKey?: number; focusId?: string }) {
  const t = useTranslations("setPet.orders");
  const ts = useTranslations("setPet.status");
  const tg = useTranslations("setPet.garments");
  const tc = useTranslations("setPet.colours");
  const locale = useLocale() as RouteLocale;
  const router = useRouter();
  const money = (irr: number) => formatCurrency(irr, locale);
  const date = (iso: string) => formatLocaleDate(iso, locale);
  const [items, setItems] = useState<SetPetRequestDto[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setState("loading");
    setPetService.list(signal).then((list) => {
      setItems(list);
      setState("ready");
    }).catch(() => {
      if (!signal?.aborted) setState("error");
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  useEffect(() => {
    if (focusId && items) document.getElementById(`setpet-order-${focusId}`)?.scrollIntoView({ block: "start" });
  }, [focusId, items]);

  const replace = (o: SetPetRequestDto) => setItems((list) => list?.map((row) => (row.id === o.id ? o : row)) ?? null);

  async function act(order: SetPetRequestDto, action: "approve" | "cancel" | "reorder") {
    setBusy(order.id);
    setActionError(null);
    try {
      if (action === "approve" && order.proof) replace(await setPetService.approveProof(order.id, order.proof.id));
      if (action === "cancel") {
        replace(await setPetService.cancel(order.id));
        setConfirmCancel(null);
      }
      if (action === "reorder") {
        await setPetService.reorder(order.id);
        router.push(`/${locale}/set-pet?draft=1#setpet-builder`);
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "SET_PET_PROOF_CHANGED" || code === "SET_PET_CHANGED" || code === "SET_PET_NOT_CANCELLABLE") {
        const fresh = await setPetService.get(order.id).catch(() => null);
        if (fresh) replace(fresh);
      }
      setActionError({ id: order.id, text: code === "SET_PET_PROOF_CHANGED" ? t("errors.proofChanged") : code === "SET_PET_NOT_CANCELLABLE" ? t("errors.notCancellable") : t("errors.generic") });
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
  if (!items?.length) {
    return (
      <div className="setpet-state">
        <p>{t("empty")}</p>
        <Link className="opl-btn primary sm" href={`/${locale}/set-pet#setpet-builder`}>{t("start")}</Link>
      </div>
    );
  }

  return (
    <ul className="setpet-orders">
      {items.map((order) => (
        <li key={order.id} id={`setpet-order-${order.id}`} className={`setpet-order${order.id === focusId ? " is-focus" : ""}`}>
          <header className="setpet-order__head">
            <strong dir="ltr">{order.reference}</strong>
            <span className={`setpet-status is-${order.status.toLowerCase()}`}>{ts(order.status)}</span>
            <small>{date(order.createdAt)}</small>
          </header>
          <p className="setpet-order__items">
            {order.items.map((i) => t("item", { garment: tg(i.garment), size: sizeLabel(i.size), colour: tc(i.colour) })).join("، ")}
          </p>
          <p className="setpet-order__price">{t("price", { amount: money(order.price.totalIrr) })}{order.price.discountIrr ? ` — ${t("discount", { percent: formatLocaleNumber(order.price.discountPercent, locale) })}` : ""}</p>

          {order.status === "SUBMITTED" ? <p className="setpet-note">{t("next.SUBMITTED")}</p> : null}
          {order.status === "NEEDS_NEW_DESIGN" ? <p className="setpet-warn"><CircleAlert size={16} aria-hidden="true" />{t("next.NEEDS_NEW_DESIGN", { reason: order.designRejectReason ?? "" })}</p> : null}
          {order.status === "PROOF_SENT" && order.proof ? (
            <div className="setpet-proofbox">
              <p>{t("next.PROOF_SENT")}</p>
              <ProofImage order={order} />
              {order.proof.note ? <p className="setpet-note">{order.proof.note}</p> : null}
              {order.proof.petPrintWidthCm && order.proof.petPrintHeightCm ? <p className="setpet-note">{t("petPrintSize", { w: formatLocaleNumber(order.proof.petPrintWidthCm, locale), h: formatLocaleNumber(order.proof.petPrintHeightCm, locale) })}</p> : null}
              <button type="button" className="opl-btn primary sm" disabled={busy === order.id} onClick={() => void act(order, "approve")}>{t("approve")}</button>
            </div>
          ) : null}
          {order.status === "AWAITING_PAYMENT" ? <PayPanel order={order} onPaid={replace} /> : null}
          {(order.status === "PAID" || order.status === "IN_PRODUCTION") && order.estimatedReadyAt ? <p className="setpet-note">{t(`next.${order.status}`, { date: date(order.estimatedReadyAt) })}</p> : null}
          {order.status === "SHIPPED" ? <p className="setpet-note">{t("next.SHIPPED", { note: order.shippingNote ?? "" })}</p> : null}
          {order.status === "CANCELLED" ? (
            <p className="setpet-note">
              {order.cancelReason ? t("cancelledReason", { reason: order.cancelReason }) : t("cancelled")}
              {order.refundedIrr ? ` ${t("refunded", { amount: money(order.refundedIrr) })}` : ""}
            </p>
          ) : null}
          {order.status === "IN_PRODUCTION" || order.status === "SHIPPED" ? <p className="setpet-note">{t("defectHelp")} <Link href={`/${locale}/support`}>{t("support")}</Link></p> : null}

          {actionError?.id === order.id ? <p className="setpet-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{actionError.text}</p> : null}

          <div className="setpet-order__actions">
            {order.canEdit ? <Link className="opl-btn soft sm" href={`/${locale}/set-pet?edit=${order.id}#setpet-builder`}>{order.status === "PROOF_SENT" ? t("requestChange") : t("edit")}</Link> : null}
            <button type="button" className="opl-btn line sm" disabled={busy === order.id} onClick={() => void act(order, "reorder")}><RotateCcw size={16} aria-hidden="true" />{t("reorder")}</button>
            {order.canCancel ? (
              confirmCancel === order.id ? (
                <span className="setpet-confirm">
                  {order.status === "PAID" ? t("confirmCancelPaid") : t("confirmCancel")}
                  <button type="button" className="opl-btn line sm" disabled={busy === order.id} onClick={() => void act(order, "cancel")}>{t("yesCancel")}</button>
                  <button type="button" className="opl-btn soft sm" onClick={() => setConfirmCancel(null)}>{t("keep")}</button>
                </span>
              ) : (
                <button type="button" className="opl-btn line sm" onClick={() => setConfirmCancel(order.id)}>{t("cancel")}</button>
              )
            ) : null}
          </div>

          <details className="setpet-timeline">
            <summary>{t("timeline")}</summary>
            <ol>
              {order.timeline.map((e, i) => (
                <li key={i}>
                  <span>{ts(e.toStatus)}</span> <small>{date(e.at)}</small>
                  {e.note && e.note !== "EDITED" ? <p>{e.note}</p> : e.note === "EDITED" ? <p>{t("edited")}</p> : null}
                </li>
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ul>
  );
}
