"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerDashboardDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";

/** Minimal but operational Seller Dashboard (spec section 40) — priorities are orders needing action, low stock, and channel sync health; never a marketing-style landing page. */
export function SellerDashboardView() {
  const t = useTranslations("seller.dashboard");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [dashboard, setDashboard] = useState<SellerDashboardDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setDashboard(await sellerOsService.getDashboard(sellerId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!dashboard) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const tiles = [
    { key: "ordersRequiringAction", value: dashboard.ordersRequiringActionCount, urgent: dashboard.ordersRequiringActionCount > 0 },
    { key: "lowStockOffers", value: dashboard.lowStockOfferCount, urgent: dashboard.lowStockOfferCount > 0 },
    { key: "activeOffers", value: dashboard.activeOfferCount, urgent: false },
    { key: "channelSyncErrors", value: dashboard.channelSyncErrorCount, urgent: dashboard.channelSyncErrorCount > 0 },
    { key: "fulfillmentExceptions", value: dashboard.fulfillmentExceptionCount, urgent: dashboard.fulfillmentExceptionCount > 0 },
    { key: "ordersToday", value: dashboard.ordersToday, urgent: false },
    { key: "unitsSoldToday", value: dashboard.unitsSoldToday, urgent: false },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <ContextSurface key={tile.key} className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t(`tiles.${tile.key}`)}</span>
            <span className={"text-page-title " + (tile.urgent ? "text-state-urgent" : "text-text-primary")}>{tile.value}</span>
          </ContextSurface>
        ))}
        <ContextSurface className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("tiles.gmvToday")}</span>
          <span className="text-page-title text-text-primary">{formatCurrency(dashboard.gmvTodayAmount, locale)}</span>
        </ContextSurface>
      </div>

      <div>
        <h2 className="text-section-title text-text-primary">{t("recentOrders")}</h2>
        {dashboard.recentOrders.length === 0 ? (
          <p className="mt-2 text-body text-text-secondary">{t("noRecentOrders")}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {dashboard.recentOrders.map((order) => (
              <button key={order.orderId} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/seller/orders/${order.orderId}`)}>
                <ContextSurface className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-body text-text-primary">{order.source ? t("marketplaceOrderLabel", { provider: order.source }) : t("petlifeOrderLabel")}</span>
                    <span className="text-metadata text-text-secondary">{t("itemCount", { count: order.itemCount })}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusLabel tone={order.status === "CANCELLED" ? "urgent" : "neutral"}>{order.status}</StatusLabel>
                    <span className="text-body text-text-primary">{formatCurrency(order.totalAmount, locale)}</span>
                  </div>
                </ContextSurface>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
