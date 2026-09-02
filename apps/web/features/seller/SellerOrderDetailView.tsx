"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
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
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-medium text-text-primary">{order.source ? t("sourceMarketplace", { provider: order.source }) : t("sourcePetlife")}</span>
          <StatusLabel tone={order.status === "CANCELLED" ? "urgent" : "neutral"}>{order.status}</StatusLabel>
        </div>
        {order.externalOrderId ? <p className="text-metadata text-text-secondary">{t("externalOrderId", { id: order.externalOrderId })}</p> : null}
        <StatusLabel tone="neutral">{t(`paymentSource.${order.paymentSource}`)}</StatusLabel>
        {order.fulfillment ? <StatusLabel tone={fulfillmentTone(order.fulfillment.status)}>{order.fulfillment.status}</StatusLabel> : null}
      </ContextSurface>

      <div>
        <h2 className="text-section-title text-text-primary">{t("items")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {order.items.map((item) => (
            <ContextSurface key={item.id} className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body text-text-primary">{item.productTitleSnapshot}</span>
                <span className="text-metadata text-text-secondary">{t("quantity", { count: item.quantity })}</span>
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
        <div className="flex items-center justify-between text-body text-text-secondary">
          <span>{t("delivery")}</span>
          <span>{formatCurrency(order.deliveryAmount, locale)}</span>
        </div>
        <div className="flex items-center justify-between text-body font-medium text-text-primary">
          <span>{t("total")}</span>
          <span>{formatCurrency(order.totalAmount, locale)}</span>
        </div>
      </ContextSurface>
    </div>
  );
}
