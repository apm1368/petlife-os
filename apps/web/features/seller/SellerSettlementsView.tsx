"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerSettlementDto } from "@petlife/types";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "./settlement-tone";

export function SellerSettlementsView() {
  const t = useTranslations("seller.finance.settlements");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [items, setItems] = useState<SellerSettlementDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setItems(await sellerFinanceService.listSettlements(sellerId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (items.length === 0) return <EmptyState title={t("empty")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {items.map((settlement) => (
        <button key={settlement.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/seller/finance/settlements/${settlement.id}`)}>
          <ContextSurface className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body font-medium text-text-primary">{settlement.reference}</span>
              <StatusLabel tone={settlementTone(settlement.status)}>{t(`status.${settlement.status}`)}</StatusLabel>
            </div>
            <span className="text-metadata text-text-secondary">
              {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(settlement.periodStart))} – {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(settlement.periodEnd))}
            </span>
            <span className="text-body text-text-primary">{formatCurrency(settlement.netIrr, locale)}</span>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
