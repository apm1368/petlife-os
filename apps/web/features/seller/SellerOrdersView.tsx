"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerOrderSummaryDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { fulfillmentTone } from "@/features/commerce/fulfillment-tone";

/** Seller Orders (spec section 37, 42) — spans PET LIFE OS checkout Orders and marketplace-origin Orders, source always shown explicitly. */
export function SellerOrdersView() {
  const t = useTranslations("seller.orders");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [orders, setOrders] = useState<SellerOrderSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      const page = await sellerOsService.listOrders(sellerId, { pageSize: 50 });
      setOrders(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!orders) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (orders.length === 0) return <EmptyState title={t("empty")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {orders.map((order) => (
        <button key={order.orderId} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/seller/orders/${order.orderId}`)}>
          <ContextSurface className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body font-medium text-text-primary">{order.source ? t("sourceMarketplace", { provider: order.source }) : t("sourcePetlife")}</span>
              <StatusLabel tone={order.status === "CANCELLED" ? "urgent" : "neutral"}>{order.status}</StatusLabel>
            </div>
            {order.externalOrderId ? <span className="text-metadata text-text-secondary">{t("externalOrderId", { id: order.externalOrderId })}</span> : null}
            <div className="flex flex-wrap gap-1.5">
              <StatusLabel tone="neutral">{t(`paymentSource.${order.paymentSource}`)}</StatusLabel>
              {order.fulfillmentStatus ? <StatusLabel tone={fulfillmentTone(order.fulfillmentStatus)}>{order.fulfillmentStatus}</StatusLabel> : null}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(order.createdAt))}</span>
              <span className="text-body text-text-primary">{formatCurrency(order.totalAmount, locale)}</span>
            </div>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
