"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { ApiError } from "@/lib/api/client";
import { verificationStatusTone } from "./insurance-status";

/** Side-by-side comparison — never a ranked "best plan" recommendation, and exclusions are shown for every product at the same level as coverage/premium (spec hard UX rule). */
export function InsuranceCompareView({ productIds }: { productIds: string[] }) {
  const t = useTranslations("insurance");
  const tCommon = useTranslations("common");

  const [products, setProducts] = useState<InsuranceProductDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setProducts(await insuranceService.compareProducts(productIds));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds.join(",")]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!products) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("compare.title")}</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {products.map((product) => (
          <ContextSurface key={product.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-body text-text-primary">
                {product.providerName} — {product.name}
              </span>
              <StatusLabel tone={verificationStatusTone(product.status)}>{t(`verificationStatus.${product.status}`)}</StatusLabel>
            </div>
            <p className="text-metadata text-text-secondary">{product.coverageSummary}</p>
            {product.waitingPeriodDays !== null ? <p className="text-metadata text-text-secondary">{t("detail.waitingPeriod", { days: product.waitingPeriodDays })}</p> : null}
            {product.deductibleAmountIrr !== null ? (
              <p className="text-metadata text-text-secondary">{t("detail.deductible", { amount: product.deductibleAmountIrr.toLocaleString() })}</p>
            ) : null}
            {product.annualLimitIrr !== null ? <p className="text-metadata text-text-secondary">{t("detail.annualLimit", { amount: product.annualLimitIrr.toLocaleString() })}</p> : null}
            {product.premiumMinIrr !== null && product.premiumMaxIrr !== null ? (
              <p className="text-metadata text-text-secondary">{t("detail.premiumRange", { min: product.premiumMinIrr.toLocaleString(), max: product.premiumMaxIrr.toLocaleString() })}</p>
            ) : null}
            <div className="rounded-md border border-state-urgent p-2">
              <h2 className="text-metadata font-semibold text-state-urgent">{t("compare.exclusions")}</h2>
              {product.exclusions.length === 0 ? (
                <p className="text-metadata text-text-secondary">{t("detail.exclusionsEmpty")}</p>
              ) : (
                <ul className="list-inside list-disc">
                  {product.exclusions.map((exclusion) => (
                    <li key={exclusion} className="text-metadata text-text-primary">
                      {exclusion}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
