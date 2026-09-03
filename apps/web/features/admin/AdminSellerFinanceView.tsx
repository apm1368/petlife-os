"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AdminSellerFinanceSummaryDto } from "@petlife/types";
import { adminFinanceService } from "@/services/admin-finance.service";
import { formatCurrency } from "@/lib/currency/format-currency";

/** Admin "search a seller, inspect balance" entry point (spec: "Admin Finance UI... extend H11 admin workspace"). */
export function AdminSellerFinanceView() {
  const t = useTranslations("admin.sellerFinance");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminSellerFinanceSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load(query: string) {
    setError(false);
    try {
      const page = await adminFinanceService.listSellerFinance(query || undefined, 1, 50);
      setRows(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(q)} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex items-end gap-2">
        <Input label={t("searchLabel")} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
        <Button onClick={() => load(q)}>{t("search")}</Button>
      </div>

      {!rows ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        rows.map((row) => (
          <button key={row.sellerOrganization.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/seller-finance/${row.sellerOrganization.id}`)}>
            <ContextSurface className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body font-medium text-text-primary">{row.sellerOrganization.name}</span>
                <span className="text-metadata text-text-secondary">{t("pending")}: {formatCurrency(row.balance.pendingIrr, locale)}</span>
              </div>
              <span className="text-body text-text-primary">{formatCurrency(row.balance.availableIrr, locale)}</span>
            </ContextSurface>
          </button>
        ))
      )}
    </div>
  );
}
