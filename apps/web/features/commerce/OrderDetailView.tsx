"use client";

import { useEffect, useState, type ReactNode } from "react";
import { randomId } from "@/lib/id/random-id";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Dialog, ErrorRecovery, Select, Skeleton, Star, StatusLabel } from "@petlife/ui";
import type { OrderDetailDto, OrderItemDto, ShipmentTrackingDto } from "@petlife/types";
import { commerceService, REFUND_REQUEST_REASONS, type RefundRequestReason } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { fulfillmentTone } from "./fulfillment-tone";
import { StarRow } from "./commerce-ui";

function dateTime(value: string, locale: "fa" | "en", withTime = true) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

/**
 * Order Detail (Order Detail pattern). Order, payment, financing,
 * fulfillment and refund states stay separate. Self-service is policy
 * driven by the server flags: cancel before dispatch (immediate full
 * refund), a reviewed refund request after delivery, one verified review
 * per delivered item. Doubles as the payment receipt — not a tax invoice.
 */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const t = useTranslations("commerce.orderDetail");
  const tStatus = useTranslations("commerce.statusLabels");
  const locale = useLocale() as "fa" | "en";
  const router = useRouter();
  const pets = usePetStore((s) => s.pets);

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [tracking, setTracking] = useState<ShipmentTrackingDto | null>(null);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState<RefundRequestReason>("DAMAGED");
  const [requestDescription, setRequestDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState(() => randomId());

  async function load() {
    setError(null);
    try {
      const detail = await commerceService.getOrder(orderId);
      setOrder(detail);
      if (detail.fulfillment) {
        try {
          setTracking(await commerceService.getOrderTracking(orderId));
        } catch {
          setTracking(null);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function act(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setActionError(null);
    try {
      await run();
      setNotice(success);
      setCancelOpen(false);
      setRequestOpen(false);
      setActionKey(randomId());
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (error === "notFound") return <ErrorRecovery title={t("notFound")} message="" retryLabel={t("backToOrders")} onRetry={() => router.push(`/${locale}/orders`)} />;
  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!order) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const delivered = order.fulfillment?.status === "DELIVERED";
  const statusLabel = order.cancelledAt ? t("cancelledRefunded") : t(`status.${order.status}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-metadata text-text-secondary" dir="ltr">
            {order.orderNumber}
          </p>
          <h1 className="text-page-title text-text-primary">{t("titleWithSeller", { seller: order.sellerOrganization.name })}</h1>
          <p className="text-metadata text-text-secondary">{t("placedAt", { when: dateTime(order.createdAt, locale) })}</p>
        </div>
        <StatusLabel tone={order.cancelledAt ? "neutral" : order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>{statusLabel}</StatusLabel>
      </div>

      {notice ? (
        <p role="status" className="rounded-md bg-surface-subtle p-3 text-body text-text-primary">
          {notice}
        </p>
      ) : null}

      {order.canCancel || order.canRequestRefund ? (
        <ContextSurface className="flex flex-col gap-2">
          {order.canCancel ? (
            <>
              <p className="text-body text-text-primary">{t("cancel.available")}</p>
              <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                {t("cancel.button")}
              </Button>
            </>
          ) : null}
          {order.canRequestRefund ? (
            <>
              <p className="text-body text-text-primary">{order.fulfillment?.status === "FAILED" ? t("refundRequest.availableFailed") : t("refundRequest.available")}</p>
              <Button variant="secondary" onClick={() => setRequestOpen(true)}>
                {t("refundRequest.button")}
              </Button>
            </>
          ) : null}
        </ContextSurface>
      ) : null}

      {order.cancelledAt && order.cancelReason ? (
        <ContextSurface className="flex flex-col gap-1">
          <p className="text-metadata text-text-secondary">{t("cancel.reasonLabel")}</p>
          <p className="text-body text-text-primary">{order.cancelReason}</p>
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-3">
        {order.items.map((item) => (
          <OrderItemRow key={item.id} orderId={orderId} item={item} canReview={delivered && order.status === "CONFIRMED" && !order.cancelledAt} petName={item.targetPetId ? pets.find((p) => p.id === item.targetPetId)?.name ?? t("unknownPet") : null} onReviewed={load} />
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <Row label={t("subtotal")} value={formatCurrency(order.subtotalAmount, locale)} />
        {order.discountAmount > 0 ? <Row label={t("discount")} value={`− ${formatCurrency(order.discountAmount, locale)}`} /> : null}
        <Row label={t("delivery")} value={formatCurrency(order.deliveryAmount, locale)} />
        <div className="border-t border-border-subtle pt-2">
          <Row label={t("total")} value={formatCurrency(order.totalAmount, locale)} strong />
        </div>
      </ContextSurface>

      {order.paymentStatus || order.financingStatus ? (
        <ContextSurface className="flex flex-col gap-2">
          {order.paymentStatus ? (
            <Row label={t("paymentStatusLabel")}>
              <StatusLabel tone={order.paymentStatus === "CAPTURED" ? "success" : order.paymentStatus === "FAILED" ? "urgent" : "neutral"}>{tStatus(`payment.${order.paymentStatus}`)}</StatusLabel>
            </Row>
          ) : null}
          {order.financingStatus ? (
            <Row label={t("financingStatusLabel")}>
              <StatusLabel tone={order.financingStatus === "APPROVED" ? "success" : order.financingStatus === "DECLINED" ? "urgent" : "neutral"}>{tStatus(`financing.${order.financingStatus}`)}</StatusLabel>
            </Row>
          ) : null}
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <p className="text-section-title text-text-primary">{t("fulfillment")}</p>
        {order.fulfillment ? (
          <>
            <StatusLabel tone={fulfillmentTone(order.fulfillment.status)}>{tStatus(`fulfillment.${order.fulfillment.status}`)}</StatusLabel>
            {tracking?.shipment?.trackingCode ? (
              <p className="text-metadata text-text-secondary">
                {t("trackingCode")}: <span dir="ltr">{tracking.shipment.trackingCode}</span>
              </p>
            ) : null}
            {tracking?.shipment?.estimatedDeliveryAt && !tracking.shipment.actualDeliveryAt ? <p className="text-metadata text-text-secondary">{t("estimatedDelivery", { when: dateTime(tracking.shipment.estimatedDeliveryAt, locale, false) })}</p> : null}
            {tracking && order.fulfillment.status !== "CANCELED" ? (
              <ol className="flex flex-col gap-1" aria-label={t("fulfillment")}>
                {tracking.timeline.map((step) => (
                  <li key={step.milestone} className="flex items-center gap-2">
                    <span aria-hidden="true" className={step.reached ? "text-state-positive" : "text-text-secondary"}>
                      {step.reached ? "●" : "○"}
                    </span>
                    <span className={`text-metadata ${step.reached ? "text-text-primary" : "text-text-secondary"}`}>{tStatus(`fulfillment.${step.milestone}`)}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {tracking?.lastUpdatedAt ? <p className="text-metadata text-text-secondary">{t("lastUpdated", { when: dateTime(tracking.lastUpdatedAt, locale) })}</p> : null}
          </>
        ) : (
          <StatusLabel tone="neutral">{t("fulfillmentPlaceholder")}</StatusLabel>
        )}
      </ContextSurface>

      {order.timeline.length ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-section-title text-text-primary">{t("timeline.title")}</p>
          <ol className="flex flex-col gap-2">
            {order.timeline.map((event, i) => (
              <li key={`${event.createdAt}-${i}`} className="flex items-start justify-between gap-3">
                <span className="text-metadata text-text-primary">{t(`timeline.${event.toStatus}` as "timeline.CONFIRMED")}</span>
                <span className="text-metadata text-text-secondary">{dateTime(event.createdAt, locale)}</span>
              </li>
            ))}
          </ol>
        </ContextSurface>
      ) : null}

      {order.refundRequests.length || order.refunds.length ? (
        <ContextSurface className="flex flex-col gap-3">
          <p className="text-section-title text-text-primary">{t("refunds.title")}</p>
          {order.refundRequests.map((request) => (
            <div key={request.id} className="flex flex-col gap-1 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body text-text-primary">{t(`refundRequest.reason.${request.reason}` as "refundRequest.reason.OTHER")}</span>
                <StatusLabel tone={request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "urgent" : "neutral"}>{t(`refundRequest.status.${request.status}` as "refundRequest.status.PENDING_REVIEW")}</StatusLabel>
              </div>
              <p className="text-metadata text-text-secondary">{t("refundRequest.sentAt", { when: dateTime(request.createdAt, locale) })}</p>
              {request.decisionReason ? <p className="text-metadata text-text-secondary">{t("refundRequest.decision", { reason: request.decisionReason })}</p> : null}
              {request.status === "APPROVED" ? <p className="text-metadata text-text-secondary">{t("refundRequest.approvedNext")}</p> : null}
              {request.status === "PENDING_REVIEW" ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => commerceService.withdrawRefundRequest(orderId, request.id), t("refundRequest.withdrawn"))}>
                  {t("refundRequest.withdraw")}
                </Button>
              ) : null}
            </div>
          ))}
          {order.refunds.map((refund) => (
            <div key={refund.id} className="flex flex-col gap-1 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <StatusLabel tone={refund.status === "SUCCEEDED" ? "success" : refund.status === "FAILED" ? "urgent" : "neutral"}>{tStatus(`refund.${refund.status}`)}</StatusLabel>
                <span className="text-body text-text-primary">{formatCurrency(refund.amount, locale)}</span>
              </div>
              {refund.providerReference ? (
                <p className="text-metadata text-text-secondary">
                  {t("refunds.providerReference")}: <span dir="ltr">{refund.providerReference}</span>
                </p>
              ) : null}
              <p className="text-metadata text-text-secondary">{t("refunds.requestedAt", { when: dateTime(refund.createdAt, locale) })}</p>
            </div>
          ))}
        </ContextSurface>
      ) : null}

      {order.shippingAddress ? (
        <ContextSurface className="flex flex-col gap-1">
          <p className="text-metadata text-text-secondary">{t("shippingAddress")}</p>
          <p className="text-body text-text-primary">{order.shippingAddress.addressLine}</p>
          <p className="text-metadata text-text-secondary">{order.shippingAddress.city}</p>
        </ContextSurface>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {order.checkoutId ? (
          <Link href={`/${locale}/checkout/${order.checkoutId}/ops`} className="text-metadata text-text-secondary underline">
            {t("viewPaymentDetails")}
          </Link>
        ) : null}
      </div>

      <Button variant="ghost" onClick={() => router.push(`/${locale}/support/new?relatedEntityType=ORDER&relatedEntityId=${orderId}&category=ORDER`)}>
        {t("getSupport")}
      </Button>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={t("cancel.title")}>
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{t("cancel.explain", { amount: formatCurrency(order.totalAmount, locale) })}</p>
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("cancel.reasonOptional")}</span>
            <textarea className="min-h-20 rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
          {actionError ? (
            <p role="alert" className="text-metadata text-state-urgent">
              {actionError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {t("cancel.keep")}
            </Button>
            <Button variant="danger" className="flex-1" isLoading={busy} onClick={() => act(() => commerceService.cancelOrder(orderId, cancelReason.trim() || undefined, actionKey), t("cancel.done"))}>
              {t("cancel.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} title={t("refundRequest.title")}>
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{t("refundRequest.explain")}</p>
          <Select label={t("refundRequest.reasonLabel")} value={requestReason} onChange={(e) => setRequestReason(e.target.value as RefundRequestReason)} options={REFUND_REQUEST_REASONS.map((r) => ({ value: r, label: t(`refundRequest.reason.${r}` as "refundRequest.reason.OTHER") }))} />
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("refundRequest.describe")}</span>
            <textarea className="min-h-24 rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" maxLength={1000} value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} />
          </label>
          {actionError ? (
            <p role="alert" className="text-metadata text-state-urgent">
              {actionError}
            </p>
          ) : null}
          <Button isLoading={busy} onClick={() => act(() => commerceService.createRefundRequest(orderId, { reason: requestReason, description: requestDescription.trim() || undefined }, actionKey), t("refundRequest.sent"))}>
            {t("refundRequest.submit")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}


function OrderItemRow({ orderId, item, canReview, petName, onReviewed }: { orderId: string; item: OrderItemDto; canReview: boolean; petName: string | null; onReviewed: () => void }) {
  const t = useTranslations("commerce.orderDetail");
  const locale = useLocale() as "fa" | "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setReviewError(null);
    try {
      await commerceService.reviewOrderItem(orderId, item.id, { rating, body: body.trim() || undefined });
      onReviewed();
    } catch (err) {
      setReviewError(err instanceof ApiError && err.status < 500 ? err.message : t("review.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="text-start text-body text-text-primary hover:underline" onClick={() => router.push(`/${locale}/shop/products/${item.productId}`)}>
          {item.productTitleSnapshot}
        </button>
        <p className="text-body text-text-primary">{formatCurrency(item.totalPrice, locale)}</p>
      </div>
      {item.variantTitleSnapshot ? <p className="text-metadata text-text-secondary">{item.variantTitleSnapshot}</p> : null}
      <p className="text-metadata text-text-secondary">{t("quantityAndUnitPrice", { quantity: item.quantity.toLocaleString(locale === "fa" ? "fa-IR" : "en-US"), price: formatCurrency(item.unitPrice, locale) })}</p>
      {item.unitDiscount > 0 && item.promotionName ? <p className="text-metadata text-state-success">{t("itemDiscount", { name: item.promotionName, amount: formatCurrency(item.unitDiscount * item.quantity, locale) })}</p> : null}
      {petName ? <p className="text-metadata text-text-secondary">{t("forPet", { name: petName })}</p> : null}
      {item.reviewId ? <p className="text-metadata text-state-success">{t("review.done")}</p> : null}
      {canReview && !item.reviewId && !open ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t("review.write")}
        </Button>
      ) : null}
      {canReview && !item.reviewId && open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface-subtle p-3">
          <div role="radiogroup" aria-label={t("review.rating")} className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("review.stars", { count: n })} onClick={() => setRating(n)} className="flex h-11 w-11 items-center justify-center">
                <Star size={24} className={n <= rating ? "fill-current text-brand-gold" : "text-border-strong"} aria-hidden="true" />
              </button>
            ))}
          </div>
          {rating ? <StarRow value={rating} /> : null}
          <textarea aria-label={t("review.body")} placeholder={t("review.body")} className="min-h-20 rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          {reviewError ? (
            <p role="alert" className="text-metadata text-state-urgent">
              {reviewError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("review.cancel")}
            </Button>
            <Button size="sm" className="flex-1" disabled={!rating} isLoading={saving} onClick={submit}>
              {t("review.submit")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong, children }: { label: string; value?: string; strong?: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      {children ?? <span className={strong ? "text-section-title font-semibold text-text-primary" : "text-body text-text-primary"}>{value}</span>}
    </div>
  );
}
