"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerFinanceSummaryDto } from "@petlife/types";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "./settlement-tone";

/**
 * Seller Finance dashboard (spec: "pending/available balance, next
 * settlement, paid settlements, refund deductions, recent transactions").
 * IRR is the only value ever stored or sent by the API — `formatCurrency`
 * is the single place that ever divides by 10 for the Toman label shown
 * here, mirroring every other money display in this app.
 */
export function SellerFinanceView() {
  const t = useTranslations("seller.finance");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [summary, setSummary] = useState<SellerFinanceSummaryDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setSummary(await sellerFinanceService.getSummary(sellerId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!summary) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const balanceTiles = [
    { key: "pending", value: summary.balance.pendingIrr },
    { key: "reserved", value: summary.balance.reservedIrr },
    { key: "available", value: summary.balance.availableIrr },
    { key: "paid", value: summary.balance.paidIrr },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <Button variant="ghost" onClick={() => router.push(`/${locale}/seller/finance/transactions`)}>
          {t("viewTransactions")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {balanceTiles.map((tile) => (
          <ContextSurface key={tile.key} className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t(`balance.${tile.key}`)}</span>
            <span className="text-section-title text-text-primary">{formatCurrency(tile.value, locale)}</span>
          </ContextSurface>
        ))}
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("nextSettlementEligible")}</span>
        <span className="text-section-title text-text-primary">{formatCurrency(summary.nextSettlementEligibleIrr, locale)}</span>
        <p className="text-metadata text-text-secondary">{t("accountCurrency", { currency: summary.account.currency, schedule: t(`schedule.${summary.account.settlementSchedule}`) })}</p>
      </ContextSurface>

      <div className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("lastSettlement")}</span>
        {summary.lastSettlement ? (
          <button type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/seller/finance/settlements/${summary.lastSettlement!.id}`)}>
            <ContextSurface className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body font-medium text-text-primary">{summary.lastSettlement.reference}</span>
                <StatusLabel tone={settlementTone(summary.lastSettlement.status)}>{t(`status.${summary.lastSettlement.status}`)}</StatusLabel>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(summary.lastSettlement.periodEnd))}</span>
                <span className="text-body text-text-primary">{formatCurrency(summary.lastSettlement.netIrr, locale)}</span>
              </div>
            </ContextSurface>
          </button>
        ) : (
          <ContextSurface>
            <p className="text-body text-text-secondary">{t("noSettlementsYet")}</p>
          </ContextSurface>
        )}
      </div>

      <Button variant="ghost" onClick={() => router.push(`/${locale}/seller/finance/settlements`)}>
        {t("viewAllSettlements")}
      </Button>
    </div>
  );
}
