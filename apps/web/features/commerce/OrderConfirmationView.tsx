"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderDetailDto } from "@petlife/types";
import { fulfillmentTone } from "./fulfillment-tone";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";

/**
 * Order Confirmation (spec section 60) — each seller's Order is shown as its
 * own block. The architecture supports one order confirming while another
 * fails; this phase's happy path always shows every id as CONFIRMED, but the
 * per-order status is read live, never assumed.
 */
export function OrderConfirmationView({ orderIds }: { orderIds: string[] }) {
  const t = useTranslations("commerce.confirmation");
  const tCommon = useTranslations("common");
  const tFulfillment = useTranslations("commerce.statusLabels.fulfillment");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const [orders, setOrders] = useState<OrderDetailDto[] | null>(null);

  useEffect(() => {
    void Promise.all(orderIds.map((id) => commerceService.getOrder(id))).then(setOrders);
  }, [orderIds]);

  if (!orders) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <p className="text-body text-text-secondary">{t("subtitle", { count: orders.length })}</p>

      {orders.map((order) => (
        <ContextSurface key={order.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body font-medium text-text-primary">{order.sellerOrganization.name}</p>
            <StatusLabel tone={order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
              {t(`orderStatus.${order.status}`)}
            </StatusLabel>
          </div>
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-metadata text-text-secondary">
                {item.productTitleSnapshot} × {item.quantity}
              </span>
              <span className="text-metadata text-text-primary">{formatCurrency(item.totalPrice, locale)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span className="text-metadata text-text-secondary">{t("delivery")}</span>
            <span className="text-metadata text-text-primary">{formatCurrency(order.deliveryAmount, locale)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle pt-2">
            <span className="text-metadata text-text-secondary">{t("total")}</span>
            <span className="text-body text-text-primary">{formatCurrency(order.totalAmount, locale)}</span>
          </div>
          {order.shippingAddress ? <p className="text-metadata text-text-secondary">{order.shippingAddress.addressLine}</p> : null}
          {order.fulfillment ? <StatusLabel tone={fulfillmentTone(order.fulfillment.status)}>{tFulfillment(order.fulfillment.status)}</StatusLabel> : null}
        </ContextSurface>
      ))}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => router.push(`/${locale}/orders`)}>
          {t("viewOrders")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => router.push(`/${locale}/shop`)}>
          {t("continueShopping")}
        </Button>
      </div>
    </div>
  );
}
