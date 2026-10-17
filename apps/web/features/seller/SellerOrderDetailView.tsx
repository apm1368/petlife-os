"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { randomId } from "@/lib/id/random-id";
import type { OrderDetailDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { fulfillmentTone } from "@/features/commerce/fulfillment-tone";

type SellerOrderDetail = OrderDetailDto & { source: string | null; externalOrderId: string | null; paymentSource: string };

/** Seller Order detail (spec section 38) — shows source/settlement honestly, and every commercial fact is the immutable snapshot from order creation, never re-derived from the live catalog. */
export function SellerOrderDetailView({ orderId }: { orderId: string }) {
  const t = useTranslations("seller.orderDetail");
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [error, setError] = useState(false);
  const tStatus = useTranslations("commerce.statusLabels");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelKey, setCancelKey] = useState(() => randomId());

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await run();
      setCancelOpen(false);
      setCancelKey(randomId());
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setOrder(await sellerOsService.getOrder(sellerId, orderId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, orderId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!order) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-metadata text-text-secondary" dir="ltr">
          {order.orderNumber}
        </p>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      </div>

      {order.cancelledAt ? (
        <ContextSurface className="flex flex-col gap-1 border-state-urgent">
          <p className="text-body font-medium text-state-urgent">{t("cancelledDoNotShip")}</p>
          {order.cancelReason ? <p className="text-metadata text-text-secondary">{order.cancelReason}</p> : null}
        </ContextSurface>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {actionError}
        </p>
      ) : null}

      {!order.cancelledAt && order.status === "CONFIRMED" && order.checkoutId && order.fulfillment ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-section-title text-text-primary">{t("nextStep")}</p>
          {order.fulfillment.status === "AWAITING_SELLER_PREPARATION" || order.fulfillment.status === "PENDING" ? (
            <Button disabled={busy} onClick={() => act(() => sellerOsService.markReadyForPickup(orderId))}>
              {t("markReady")}
            </Button>
          ) : null}
          {order.fulfillment.status === "READY_FOR_PICKUP" ? (
            <Button disabled={busy} onClick={() => act(() => sellerOsService.requestCourier(orderId, cancelKey))}>
              {t("requestCourier")}
            </Button>
          ) : null}
          {["PENDING", "AWAITING_SELLER_PREPARATION", "READY_FOR_PICKUP"].includes(order.fulfillment.status) ? (
            <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>
              {t("cancelOrder")}
            </Button>
          ) : null}
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-medium text-text-primary">{order.source ? t("sourceMarketplace", { provider: order.source }) : t("sourcePetlife")}</span>
          <StatusLabel tone={order.status === "CANCELLED" || order.cancelledAt ? "urgent" : "neutral"}>{t(`orderStatus.${order.status}` as "orderStatus.CONFIRMED")}</StatusLabel>
        </div>
        {order.externalOrderId ? <p className="text-metadata text-text-secondary">{t("externalOrderId", { id: order.externalOrderId })}</p> : null}
        <StatusLabel tone="neutral">{t(`paymentSource.${order.paymentSource}`)}</StatusLabel>
        {order.fulfillment ? <StatusLabel tone={fulfillmentTone(order.fulfillment.status)}>{tStatus(`fulfillment.${order.fulfillment.status}`)}</StatusLabel> : null}
      </ContextSurface>

      <div>
        <h2 className="text-section-title text-text-primary">{t("items")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {order.items.map((item) => (
            <ContextSurface key={item.id} className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body text-text-primary">{item.productTitleSnapshot}</span>
                {item.variantTitleSnapshot ? <span className="text-metadata text-text-secondary">{item.variantTitleSnapshot}</span> : null}
                <span className="text-metadata text-text-secondary" dir="ltr">
                  {item.skuSnapshot}
                </span>
                <span className="text-metadata text-text-secondary">{t("quantity", { count: item.quantity })}</span>
                {item.unitDiscount > 0 && item.promotionName ? <span className="text-metadata text-state-success">{t("promotionApplied", { name: item.promotionName })}</span> : null}
              </div>
              <span className="text-body text-text-primary">{formatCurrency(item.totalPrice, locale)}</span>
            </ContextSurface>
          ))}
        </div>
      </div>

      <ContextSurface className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-body text-text-secondary">
          <span>{t("subtotal")}</span>
          <span>{formatCurrency(order.subtotalAmount, locale)}</span>
        </div>
        {order.discountAmount > 0 ? (
          <div className="flex items-center justify-between text-body text-text-secondary">
            <span>{t("discount")}</span>
            <span>− {formatCurrency(order.discountAmount, locale)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-body text-text-secondary">
          <span>{t("delivery")}</span>
          <span>{formatCurrency(order.deliveryAmount, locale)}</span>
        </div>
        <div className="flex items-center justify-between text-body font-medium text-text-primary">
          <span>{t("total")}</span>
          <span>{formatCurrency(order.totalAmount, locale)}</span>
        </div>
      </ContextSurface>

      {order.refundRequests.length ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-section-title text-text-primary">{t("refundRequests")}</p>
          {order.refundRequests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-metadata">
              <span className="text-text-primary">{t(`refundReason.${r.reason}` as "refundReason.OTHER")}</span>
              <StatusLabel tone={r.status === "APPROVED" ? "urgent" : "neutral"}>{t(`refundStatus.${r.status}` as "refundStatus.PENDING_REVIEW")}</StatusLabel>
            </div>
          ))}
          <p className="text-metadata text-text-secondary">{t("refundRequestsNote")}</p>
        </ContextSurface>
      ) : null}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={t("cancelOrder")}>
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{t("cancelExplain", { amount: formatCurrency(order.totalAmount, locale) })}</p>
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("cancelReason")}</span>
            <textarea className="min-h-20 rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
          <Button variant="danger" disabled={cancelReason.trim().length < 3} isLoading={busy} onClick={() => sellerId && act(() => sellerOsService.cancelOrder(sellerId, orderId, cancelReason.trim(), cancelKey))}>
            {t("cancelConfirm")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
