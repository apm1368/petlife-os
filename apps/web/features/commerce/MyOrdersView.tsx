"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { isolate } from "@/lib/text/bidi";
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
            className={`shrink-0 rounded-full border px-4 py-2 text-metadata ${tab === key ? "border-brand-natural bg-brand-solid text-on-brand" : "border-border-subtle text-text-secondary"}`}
          >
            {t(`tabs.${key}`, { count: counts[key] })}
          </button>
        ))}
      </div>

      {counts[tab] === 0 ? <p className="text-body text-text-secondary">{t(`tabEmpty.${tab}`)}</p> : null}

      <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
        {orders.filter((o) => orderTab(o) === tab).map((order) => {
          const money = [
            order.paymentStatus ? tStatus(`payment.${order.paymentStatus}`) : null,
            order.financingStatus ? tStatus(`financing.${order.financingStatus}`) : null,
            order.refundStatus ? tStatus(`refund.${order.refundStatus}`) : null,
          ].filter(Boolean);
          return (
            <li key={order.id}>
              <button type="button" className="order-row" onClick={() => router.push(`/${locale}/orders/${order.id}`)}>
                <span className="order-row__main">
                  <span className="text-metadata text-text-secondary" dir="ltr">{order.orderNumber}</span>
                  <span className="truncate text-body font-semibold text-text-primary">{order.previewTitles.join(locale === "fa" ? "، " : ", ") || order.sellerOrganization.name}</span>
                  <span className="text-metadata text-text-secondary">
                    <span className="[unicode-bidi:isolate]">{t("soldBy", { seller: isolate(order.sellerOrganization.name) })}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="[unicode-bidi:isolate]">{t("itemCount", { count: order.itemCount })}</span>
                  </span>
                  {money.length ? <span className="text-metadata text-text-secondary">{money.join(" · ")}</span> : null}
                </span>
                <span className="order-row__side">
                  <span className="flex flex-wrap justify-end gap-1.5">
                    <StatusLabel tone={order.cancelledAt ? "neutral" : order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
                      {order.cancelledAt ? t("cancelledRefunded") : t(`status.${order.status}`)}
                    </StatusLabel>
                    {order.fulfillmentStatus ? (
                      <StatusLabel tone={order.fulfillmentStatus === "DELIVERED" ? "success" : order.fulfillmentStatus === "FAILED" || order.fulfillmentStatus === "CANCELED" ? "urgent" : "neutral"}>
                        {tStatus(`fulfillment.${order.fulfillmentStatus}`)}
                      </StatusLabel>
                    ) : null}
                  </span>
                  <span className="text-body font-semibold text-text-primary">{formatCurrency(order.totalAmount, locale)}</span>
                  <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(order.createdAt))}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
