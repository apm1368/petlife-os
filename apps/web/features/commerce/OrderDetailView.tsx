"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { OrderDetailDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { usePetStore } from "@/stores/pet-store";

/** Order Detail (spec section 61) — Order/Seller/Items/Pet/Payment state/Fulfillment placeholder/Address/Total. No delivery tracking this phase. */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const t = useTranslations("commerce.orderDetail");
  const locale = useLocale() as "fa" | "en";
  const pets = usePetStore((s) => s.pets);

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setOrder(null);
    try {
      setOrder(await commerceService.getOrder(orderId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!order) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{order.sellerOrganization.name}</h1>
        <StatusLabel tone={order.status === "CONFIRMED" ? "success" : order.status === "CANCELLED" ? "urgent" : "neutral"}>
          {t(`status.${order.status}`)}
        </StatusLabel>
      </div>

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

      <ContextSurface className="flex flex-col gap-1">
        <p className="text-metadata text-text-secondary">{t("fulfillment")}</p>
        <StatusLabel tone="neutral">{t("fulfillmentPlaceholder")}</StatusLabel>
      </ContextSurface>

      <p className="text-metadata text-text-secondary">
        {t("placedAt", { when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt)) })}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}
