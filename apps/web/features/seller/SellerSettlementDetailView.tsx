"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerSettlementDetailDto } from "@petlife/types";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "./settlement-tone";

/** Seller settlement detail (spec: "reference/period/status/gross/commission/channel fee/refunds/adjustments/net payout/contained orders/payout reference/timeline"). Isolation is enforced server-side (SellerFinanceReadService.getSettlement 404s a foreign settlement) — this view never assumes the id it was given belongs to the active seller. */
export function SellerSettlementDetailView({ settlementId }: { settlementId: string }) {
  const t = useTranslations("seller.finance.settlementDetail");
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [settlement, setSettlement] = useState<SellerSettlementDetailDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setSettlement(await sellerFinanceService.getSettlement(sellerId, settlementId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, settlementId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!settlement) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const rows = [
    { key: "gross", value: settlement.grossIrr },
    { key: "commission", value: -settlement.commissionIrr },
    { key: "refunds", value: -settlement.refundsIrr },
    { key: "adjustments", value: settlement.adjustmentsIrr },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{settlement.reference}</h1>
        <StatusLabel tone={settlementTone(settlement.status)}>{t(`status.${settlement.status}`)}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">
          {t("period", {
            start: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(settlement.periodStart)),
            end: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(settlement.periodEnd)),
          })}
        </span>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <span className="text-body text-text-secondary">{t(`breakdown.${row.key}`)}</span>
            <span className="text-body text-text-primary">{formatCurrency(row.value, locale)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
          <span className="text-body font-medium text-text-primary">{t("breakdown.net")}</span>
          <span className="text-section-title text-text-primary">{formatCurrency(settlement.netIrr, locale)}</span>
        </div>
      </ContextSurface>

      {settlement.payoutMethodType ? (
        <ContextSurface className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("payoutMethod")}</span>
          <span className="text-body text-text-primary">{settlement.payoutMethodType}</span>
          {settlement.paidAt ? <span className="text-metadata text-text-secondary">{t("paidAt", { date: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(settlement.paidAt)) })}</span> : null}
        </ContextSurface>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("items", { count: settlement.items.length })}</span>
        {settlement.items.map((item) => (
          <ContextSurface key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">{item.description}</span>
              <span className="text-metadata text-text-secondary">{t(`sourceType.${item.sourceType}`)}</span>
            </div>
            <span className={"text-body " + (item.netAmount < 0 ? "text-state-urgent" : "text-text-primary")}>{formatCurrency(item.netAmount, locale)}</span>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
