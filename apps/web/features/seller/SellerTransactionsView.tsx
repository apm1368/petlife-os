"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerTransactionDto } from "@petlife/types";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "./settlement-tone";

const PAGE_SIZE = 25;

/** Seller transaction history (spec: "Order/Gross/Commission/Fees/Refund/Net/Settlement status/date/channel — paginated"). Filter by settlement status only this phase (period/order filtering exists server-side but has no UI control yet — kept intentionally minimal, see README). */
export function SellerTransactionsView() {
  const t = useTranslations("seller.finance.transactions");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [items, setItems] = useState<SellerTransactionDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  async function load(nextPage: number, append: boolean) {
    if (!sellerId) return;
    setError(false);
    try {
      const result = await sellerFinanceService.listTransactions(sellerId, { page: nextPage, pageSize: PAGE_SIZE });
      setItems((prev) => (append && prev ? [...prev, ...result.items] : result.items));
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(1, false)} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (items.length === 0) return <EmptyState title={t("empty")} />;

  const hasMore = items.length < total;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {items.map((row) => (
        <button
          key={row.id}
          type="button"
          className="w-full text-start"
          disabled={!row.breakdown}
          onClick={() => row.breakdown && router.push(`/${locale}/seller/orders/${row.referenceId}`)}
        >
          <ContextSurface className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body font-medium text-text-primary">{row.description}</span>
              {row.settlementStatus ? <StatusLabel tone={settlementTone(row.settlementStatus)}>{t(`settlementStatus.${row.settlementStatus}`)}</StatusLabel> : <StatusLabel tone="neutral">{t("settlementStatus.UNSETTLED")}</StatusLabel>}
            </div>
            {row.breakdown ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-metadata text-text-secondary">
                <span>{t("gross", { amount: formatCurrency(row.breakdown.grossMerchandiseIrr, locale) })}</span>
                <span>{t("commission", { amount: formatCurrency(row.breakdown.platformCommissionIrr, locale) })}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(row.createdAt))}</span>
              <span className={"text-body " + (row.netAmountIrr < 0 ? "text-state-urgent" : "text-text-primary")}>{formatCurrency(row.netAmountIrr, locale)}</span>
            </div>
          </ContextSurface>
        </button>
      ))}

      {hasMore ? (
        <button type="button" className="text-body text-text-secondary underline" onClick={() => load(page + 1, true)}>
          {t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}
