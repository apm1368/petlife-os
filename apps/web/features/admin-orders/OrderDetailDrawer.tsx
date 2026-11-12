"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet, X } from "@petlife/ui";
import type { AdminOrderDetailDto, AdminOrderRowDto } from "@petlife/types";
import Link from "@/features/navigation/localized-link";
import { adminOrdersService } from "@/services/admin-orders.service";
import { useOrderLabels } from "./order-labels";

const DATE_FACTS = new Set(["startsAt", "checkIn", "checkOut"]);
const MONEY_FACTS = new Set(["sellerNet", "deposit", "payNow", "refunded"]);

/** One order in full: lines, money, payments, refunds, shipment, address, timeline and linked support cases. */
export function OrderDetailDrawer({ row, canRevealPii, onClose }: { row: AdminOrderRowDto; canRevealPii: boolean; onClose: () => void }) {
  const t = useTranslations("adminOrders");
  const l = useOrderLabels();
  const [detail, setDetail] = useState<AdminOrderDetailDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adminOrdersService.detail(row.section, row.id, controller.signal).then(setDetail).catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [row.section, row.id]);

  const reveal = async () => {
    if (!row.customer?.userId) return;
    if (reason.trim().length < 5) return setRevealError(t("reveal.reasonRequired"));
    setRevealError(null);
    try {
      setRevealed((await adminOrdersService.revealPhone(row.customer.userId, reason.trim())).value);
      setRevealing(false);
    } catch {
      setRevealError(t("reveal.failed"));
    }
  };
  const factValue = (key: string, value: string | number | null) => {
    if (value === null || value === "") return null;
    if (DATE_FACTS.has(key) && typeof value === "string") return l.dateTime(value);
    if (MONEY_FACTS.has(key) && typeof value === "number") return l.money(value);
    if (key === "commissionRate" && typeof value === "number") return `${l.number(value)}%`;
    return typeof value === "number" ? l.number(value) : l.code(value);
  };
  const d = detail;

  return (
    <Sheet open onClose={onClose} title={t("drawer.title", { number: row.number })} className="gx-orders-drawer">
      <div className="gx-orders-drawer__body">
        <header className="gx-orders-drawer__head">
          <div>
            <p className="gx-kicker">{l.section(row.section)}</p>
            <h2 dir="ltr">{row.number}</h2>
            <p className="gx-muted">{l.dateTime(row.createdAt)}</p>
          </div>
          <button type="button" className="gx-btn" onClick={onClose} aria-label={t("drawer.close")}><X size={18} aria-hidden="true" /></button>
        </header>
        {failed ? <p className="gx-inline-alert" role="alert">{t("errors.failed")}</p> : !d ? <div className="gx-skel" style={{ minHeight: 240 }} aria-busy="true" /> : (
          <>
            <dl className="gx-orders-summary">
              <div><dt>{t("col.fulfilment")}</dt><dd>{l.code(d.status, d.section)}</dd></div>
              <div><dt>{t("col.payment")}</dt><dd>{t(`payment.${d.payment.state}`)}{d.payment.method ? ` · ${l.code(d.payment.method)}` : ""}{d.payment.provider ? ` · ${l.code(d.payment.provider)}` : ""}</dd></div>
              <div><dt>{t("col.partner")}</dt><dd>{d.partner?.kind === "PLATFORM" ? t("platform") : d.partner?.name ?? "—"}</dd></div>
              <div>
                <dt>{t("col.customer")}</dt>
                <dd>
                  {d.customer?.anonymous ? t("anonymous") : d.customer?.name ?? "—"}
                  {d.customer?.phoneMasked ? <span dir="ltr" className="gx-muted"> {revealed ?? d.customer.phoneMasked}</span> : null}
                  {d.customer?.userId ? <> · <Link href={`/admin/customers/${encodeURIComponent(d.customer.userId)}`} className="gx-link">{t("drawer.customer360")}</Link></> : null}
                </dd>
              </div>
            </dl>
            {canRevealPii && d.customer?.userId && d.customer.phoneMasked && !revealed ? (
              revealing ? (
                <div className="gx-orders-reveal">
                  <label className="gx-field">{t("reveal.reason")}<input value={reason} maxLength={300} autoFocus onChange={(e) => setReason(e.target.value)} placeholder={t("reveal.reasonPlaceholder")} /></label>
                  {revealError ? <p role="alert" className="gx-inline-alert">{revealError}</p> : null}
                  <div className="gx-orders-actions">
                    <button type="button" className="gx-btn gx-btn--honey" onClick={() => void reveal()}>{t("reveal.confirm")}</button>
                    <button type="button" className="gx-btn" onClick={() => setRevealing(false)}>{t("drawer.cancel")}</button>
                  </div>
                  <p className="gx-muted">{t("reveal.audited")}</p>
                </div>
              ) : (
                <button type="button" className="gx-btn" onClick={() => setRevealing(true)}>{t("reveal.button")}</button>
              )
            ) : null}

            <section aria-labelledby="od-lines">
              <h3 id="od-lines" className="gx-section-title">{t("drawer.items")}</h3>
              <div className="gx-table-wrap">
                <table className="gx-table">
                  <thead><tr><th scope="col">{t("drawer.item")}</th><th scope="col">{t("drawer.qty")}</th><th scope="col">{t("drawer.unit")}</th><th scope="col">{t("drawer.lineTotal")}</th></tr></thead>
                  <tbody>
                    {d.lines.map((x, i) => (
                      <tr key={i}>
                        <td>{x.name === "PET_FEE" ? t("drawer.petFee") : (l.locale === "fa" && d.items[i]?.nameFa) || x.name}{x.variant ? <span className="gx-muted"> · {l.code(x.variant)}</span> : null}{x.sku ? <small className="gx-muted" dir="ltr">{x.sku}</small> : null}</td>
                        <td className="gx-num">{l.number(x.quantity)}</td>
                        <td className="gx-num">{l.money(x.unitPriceIrr)}</td>
                        <td className="gx-num">{l.money(x.totalIrr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="gx-orders-money">
                {d.amounts.subtotalIrr !== null ? <div><dt>{t("amount.subtotal")}</dt><dd className="gx-num">{l.money(d.amounts.subtotalIrr)}</dd></div> : null}
                {d.amounts.shippingIrr !== null ? <div><dt>{t("amount.shipping")}</dt><dd className="gx-num">{l.money(d.amounts.shippingIrr)}</dd></div> : null}
                {d.amounts.discountIrr ? <div><dt>{t("amount.discount")}</dt><dd className="gx-num">−{l.money(d.amounts.discountIrr)}</dd></div> : null}
                <div className="gx-orders-money__total"><dt>{t("amount.total")}</dt><dd className="gx-num">{l.money(d.amounts.totalIrr)}</dd></div>
                {d.amounts.commissionIrr !== null ? <div><dt>{t("amount.commission")}</dt><dd className="gx-num">{l.money(d.amounts.commissionIrr)}</dd></div> : null}
              </dl>
            </section>

            {d.facts.some((f) => factValue(f.key, f.value) !== null) ? (
              <section aria-labelledby="od-facts">
                <h3 id="od-facts" className="gx-section-title">{t("drawer.details")}</h3>
                <dl className="gx-orders-facts">
                  {d.facts.map((f) => {
                    const v = factValue(f.key, f.value);
                    return v === null ? null : <div key={f.key}><dt>{t.has(`facts.${f.key}`) ? t(`facts.${f.key}`) : f.key}</dt><dd>{v}</dd></div>;
                  })}
                </dl>
              </section>
            ) : null}

            {d.shipment || d.address ? (
              <section aria-labelledby="od-delivery">
                <h3 id="od-delivery" className="gx-section-title">{d.section === "SHOP" ? t("drawer.delivery") : t("drawer.place")}</h3>
                {d.shipment ? (
                  <p>
                    {l.code(d.shipment.provider)} · {l.code(d.shipment.status)}
                    {d.shipment.trackingCode ? <> · <span dir="ltr">{d.shipment.trackingCode}</span></> : null}
                    {d.shipment.estimatedDeliveryAt ? <small className="gx-muted">{t("drawer.eta", { date: l.dateTime(d.shipment.estimatedDeliveryAt) })}</small> : null}
                  </p>
                ) : null}
                {d.address ? (
                  <address className="gx-orders-address">
                    {[d.address.recipient, d.address.line, [d.address.city, d.address.region].filter(Boolean).join("، ")].filter(Boolean).join(" — ")}
                    {d.address.phoneMasked ? <span dir="ltr" className="gx-muted"> {d.address.phoneMasked}</span> : null}
                  </address>
                ) : null}
              </section>
            ) : null}

            <section aria-labelledby="od-payments">
              <h3 id="od-payments" className="gx-section-title">{t("drawer.payments")}</h3>
              {d.payments.length ? (
                <ul className="gx-list">
                  {d.payments.map((p) => <li key={p.id}>{l.code(p.provider)}{p.rail ? ` · ${l.code(p.rail)}` : ""} · {l.code(p.status)} · <span className="gx-num">{l.money(p.amountIrr)}</span> <small className="gx-muted">{l.dateTime(p.createdAt)}</small></li>)}
                </ul>
              ) : <p className="gx-muted">{d.payment.state === "ON_ARRIVAL" ? t("drawer.payOnArrival") : t("drawer.noPayments")}</p>}
              {d.refunds.length ? (
                <>
                  <h4 className="gx-orders-sub">{t("drawer.refunds")}</h4>
                  <ul className="gx-list">
                    {d.refunds.map((r) => <li key={r.id}>{l.code(r.status)} · <span className="gx-num">{l.money(r.amountIrr)}</span>{r.reason ? ` · ${r.reason}` : ""} <small className="gx-muted">{l.dateTime(r.completedAt ?? r.createdAt)}</small></li>)}
                  </ul>
                </>
              ) : null}
            </section>

            <section aria-labelledby="od-timeline">
              <h3 id="od-timeline" className="gx-section-title">{t("drawer.timeline")}</h3>
              {d.timeline.length ? (
                <ol className="gx-timeline gx-orders-timeline">
                  {d.timeline.map((e, i) => (
                    <li key={i}><b>{l.code(e.to, d.section)}</b> <small className="gx-muted">{l.dateTime(e.at)}{e.actor ? ` · ${l.code(e.actor)}` : ""}</small>{e.reason ? <p className="gx-muted">{l.code(e.reason)}</p> : null}</li>
                  ))}
                </ol>
              ) : <p className="gx-muted">{t("drawer.noTimeline")}</p>}
            </section>

            <section aria-labelledby="od-support">
              <h3 id="od-support" className="gx-section-title">{t("drawer.support")}</h3>
              {d.supportCases.length ? (
                <ul className="gx-list">
                  {d.supportCases.map((c) => <li key={c.id}><Link href={`/admin/support/${c.id}`} className="gx-link" dir="ltr">{c.caseNumber}</Link> · {c.subject} · {l.code(c.status)}</li>)}
                </ul>
              ) : <p className="gx-muted">{t("drawer.noSupport")}</p>}
            </section>

            {d.legacyHref ? <p><Link href={d.legacyHref} className="gx-link">{t("drawer.openSection", { section: l.section(d.section) })}</Link></p> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
