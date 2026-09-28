"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";

type Tab = "active" | "delivered" | "closed";

/** Which tab an order belongs to: closed = cancelled/refunded, delivered = handed over, active = everything still in motion. */
export function orderTab(order: OrderSummaryDto): Tab {
  if (order.cancelledAt || order.status === "CANCELLED" || order.status === "REFUNDED" || order.status === "PARTIALLY_REFUNDED") return "closed";
  if (order.fulfillmentStatus === "DELIVERED") return "delivered";
  return "active";
}

/** My Orders (Order Detail pattern, list side) — tabs by where the order is, never re-derived solely from its Checkout. */
export function MyOrdersView() {
  const t = useTranslations("commerce.myOrders");
  const tStatus = useTranslations("commerce.statusLabels");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [orders, setOrders] = useState<OrderSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, delivered: 0, closed: 0 };
    for (const o of orders ?? []) c[orderTab(o)]++;
    return c;
  }, [orders]);

  async function load() {
    setError(false);
    try {
      const list = await commerceService.listOrders();
      setOrders(list);
      // Open on the first tab that has something in it.
      const firstNonEmpty = (["active", "delivered", "closed"] as Tab[]).find((k) => list.some((o) => orderTab(o) === k));
      if (firstNonEmpty) setTab(firstNonEmpty);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <button type="button" className="text-cta text-brand-natural" onClick={() => router.push(`/${locale}/repeat-delivery`)}>
          {t("repeatLink")}
        </button>
      </div>

      <div role="tablist" aria-label={t("title")} className="flex gap-2 overflow-x-auto">
        {(["active", "delivered", "closed"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-metadata ${tab === key ? "border-brand-natural bg-brand-natural text-text-inverse" : "border-border-subtle text-text-secondary"}`}
          >
            {t(`tabs.${key}`, { count: counts[key] })}
          </button>
        ))}
      </div>

      {counts[tab] === 0 ? <p className="text-body text-text-secondary">{t(`tabEmpty.${tab}`)}</p> : null}

      {orders.filter((o) => orderTab(o) === tab).map((order) => (
        <button key={order.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/orders/${order.id}`)}>
          <ContextSurface className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-metadata text-text-secondary" dir="ltr">{order.orderNumber}</p>
                <p className="truncate text-body font-medium text-text-primary">{order.previewTitles.join("، ") || order.sellerOrganization.name}</p>
                <p className="text-metadata text-text-secondary">{t("soldBy", { seller: order.sellerOrganization.name })}</p>
              </div>
              <StatusLabel tone={order.cancelledAt ? "neutral" : order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
                {order.cancelledAt ? t("cancelledRefunded") : t(`status.${order.status}`)}
              </StatusLabel>
            </div>
            <p className="text-metadata text-text-secondary">{t("itemCount", { count: order.itemCount })}</p>
            {order.paymentStatus || order.financingStatus || order.refundStatus || order.fulfillmentStatus ? (
              <div className="flex flex-wrap gap-1.5">
                {order.paymentStatus ? <StatusLabel tone="neutral">{tStatus(`payment.${order.paymentStatus}`)}</StatusLabel> : null}
                {order.financingStatus ? <StatusLabel tone="neutral">{tStatus(`financing.${order.financingStatus}`)}</StatusLabel> : null}
                {order.refundStatus ? <StatusLabel tone="neutral">{tStatus(`refund.${order.refundStatus}`)}</StatusLabel> : null}
                {order.fulfillmentStatus ? (
                  <StatusLabel tone={order.fulfillmentStatus === "DELIVERED" ? "success" : order.fulfillmentStatus === "FAILED" || order.fulfillmentStatus === "CANCELED" ? "urgent" : "neutral"}>
                    {tStatus(`fulfillment.${order.fulfillmentStatus}`)}
                  </StatusLabel>
                ) : null}
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
