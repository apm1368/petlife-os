"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";

/** My Orders (spec section 61) — an Order is its own record, never re-derived solely from its Checkout. */
export function MyOrdersView() {
  const t = useTranslations("commerce.myOrders");
  const tStatus = useTranslations("commerce.statusLabels");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [orders, setOrders] = useState<OrderSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setOrders(await commerceService.listOrders());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!orders) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (orders.length === 0) return <EmptyState title={t("empty")} actionLabel={t("browseShop")} onAction={() => router.push(`/${locale}/shop`)} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {orders.map((order) => (
        <button key={order.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/orders/${order.id}`)}>
          <ContextSurface className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-medium text-text-primary">{order.sellerOrganization.name}</p>
              <StatusLabel tone={order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
                {t(`status.${order.status}`)}
              </StatusLabel>
            </div>
            <p className="text-metadata text-text-secondary">{t("itemCount", { count: order.itemCount })}</p>
            {order.paymentStatus || order.financingStatus || order.refundStatus ? (
              <div className="flex flex-wrap gap-1.5">
                {order.paymentStatus ? <StatusLabel tone="neutral">{tStatus(`payment.${order.paymentStatus}`)}</StatusLabel> : null}
                {order.financingStatus ? <StatusLabel tone="neutral">{tStatus(`financing.${order.financingStatus}`)}</StatusLabel> : null}
                {order.refundStatus ? <StatusLabel tone="neutral">{tStatus(`refund.${order.refundStatus}`)}</StatusLabel> : null}
              </div>
            ) : null}
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
