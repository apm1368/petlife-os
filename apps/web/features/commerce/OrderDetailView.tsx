"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderDetailDto, ShipmentTrackingDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { fulfillmentTone } from "./fulfillment-tone";

/**
 * Order Detail (spec section 61; Handoff 07 sections 42-43) — Order status,
 * Payment status, Financing status, and Refund status are always shown
 * separately, never collapsed into one ambiguous badge. Also doubles as the
 * payment receipt view (amount/provider/reference/date/status) — not a tax
 * invoice, since no legally-valid invoicing exists yet.
 */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const t = useTranslations("commerce.orderDetail");
  const tStatus = useTranslations("commerce.statusLabels");
  const locale = useLocale() as "fa" | "en";
  const pets = usePetStore((s) => s.pets);

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [tracking, setTracking] = useState<ShipmentTrackingDto | null>(null);
  const [error, setError] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => crypto.randomUUID());

  async function load() {
    setError(false);
    setOrder(null);
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
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function requestRefund() {
    setIsRequestingRefund(true);
    setRefundError(null);
    try {
      await commerceService.requestRefund(orderId, refundReason || undefined, undefined, refundIdempotencyKey);
      setRefundReason("");
      setRefundIdempotencyKey(crypto.randomUUID());
      await load();
    } catch (err) {
      setRefundError(err instanceof ApiError ? err.message : t("refunds.requestFailed"));
    } finally {
      setIsRequestingRefund(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!order) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const canRequestRefund = order.status === "CONFIRMED" && order.refunds.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{order.sellerOrganization.name}</h1>
        <StatusLabel tone={order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
          {t(`status.${order.status}`)}
        </StatusLabel>
      </div>

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

      <ContextSurface className="flex flex-col gap-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body text-text-primary">{item.productTitleSnapshot}</p>
              <p className="text-body text-text-primary">{formatCurrency(item.totalPrice, locale)}</p>
            </div>
            {item.variantTitleSnapshot ? <p className="text-metadata text-text-secondary">{item.variantTitleSnapshot}</p> : null}
            <p className="text-metadata text-text-secondary">{t("quantityAndUnitPrice", { quantity: item.quantity, price: formatCurrency(item.unitPrice, locale) })}</p>
            {item.targetPetId ? (
              <p className="text-metadata text-text-secondary">{t("forPet", { name: pets.find((p) => p.id === item.targetPetId)?.name ?? t("unknownPet") })}</p>
            ) : null}
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <Row label={t("subtotal")} value={formatCurrency(order.subtotalAmount, locale)} />
        <Row label={t("delivery")} value={formatCurrency(order.deliveryAmount, locale)} />
        <Row label={t("total")} value={formatCurrency(order.totalAmount, locale)} />
      </ContextSurface>

      {order.shippingAddress ? (
        <ContextSurface className="flex flex-col gap-1">
          <p className="text-metadata text-text-secondary">{t("shippingAddress")}</p>
          <p className="text-body text-text-primary">{order.shippingAddress.addressLine}</p>
          <p className="text-metadata text-text-secondary">{order.shippingAddress.city}</p>
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <p className="text-metadata text-text-secondary">{t("fulfillment")}</p>
        {order.fulfillment ? (
          <>
            <StatusLabel tone={fulfillmentTone(order.fulfillment.status)}>{tStatus(`fulfillment.${order.fulfillment.status}`)}</StatusLabel>
            {tracking?.shipment?.trackingCode ? (
              <p className="text-metadata text-text-secondary">
                {t("trackingCode")}: {tracking.shipment.trackingCode}
              </p>
            ) : null}
            {tracking?.shipment?.estimatedDeliveryAt && !tracking.shipment.actualDeliveryAt ? (
              <p className="text-metadata text-text-secondary">
                {t("estimatedDelivery", { when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(tracking.shipment.estimatedDeliveryAt)) })}
              </p>
            ) : null}
            {tracking ? (
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
            ) : (
              <p className="text-metadata text-text-secondary">{t("trackingUnavailable")}</p>
            )}
            {tracking?.lastUpdatedAt ? (
              <p className="text-metadata text-text-secondary">
                {t("lastUpdated", { when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(tracking.lastUpdatedAt)) })}
              </p>
            ) : null}
          </>
        ) : (
          <StatusLabel tone="neutral">{t("fulfillmentPlaceholder")}</StatusLabel>
        )}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-section-title text-text-primary">{t("refunds.title")}</p>
        {order.refunds.length === 0 ? (
          <p className="text-metadata text-text-secondary">{t("refunds.none")}</p>
        ) : (
          order.refunds.map((refund) => (
            <div key={refund.id} className="flex flex-col gap-1 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <StatusLabel tone={refund.status === "SUCCEEDED" ? "success" : refund.status === "FAILED" ? "urgent" : "neutral"}>
                  {tStatus(`refund.${refund.status}`)}
                </StatusLabel>
                <span className="text-body text-text-primary">{formatCurrency(refund.amount, locale)}</span>
              </div>
              {refund.providerReference ? <p className="text-metadata text-text-secondary">{t("refunds.providerReference")}: {refund.providerReference}</p> : null}
              <p className="text-metadata text-text-secondary">
                {t("refunds.requestedAt", { when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(refund.createdAt)) })}
              </p>
            </div>
          ))
        )}

        {canRequestRefund ? (
          <div className="flex flex-col gap-2">
            {refundError ? (
              <p role="alert" className="text-metadata text-state-urgent">
                {refundError}
              </p>
            ) : null}
            <input
              aria-label={t("refunds.reasonPlaceholder")}
              placeholder={t("refunds.reasonPlaceholder")}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
            />
            <Button variant="secondary" isLoading={isRequestingRefund} onClick={requestRefund}>
              {t("refunds.submit")}
            </Button>
          </div>
        ) : null}
      </ContextSurface>

      <p className="text-metadata text-text-secondary">
        {t("placedAt", { when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt)) })}
      </p>

      {order.checkoutId ? (
        <Link href={`/${locale}/checkout/${order.checkoutId}/ops`} className="text-metadata text-text-secondary underline">
          {t("viewPaymentDetails")}
        </Link>
      ) : null}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      {children ?? <span className="text-body text-text-primary">{value}</span>}
    </div>
  );
}
