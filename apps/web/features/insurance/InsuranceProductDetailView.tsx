"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { verificationStatusTone } from "./insurance-status";
import { formatCurrency } from "@/lib/currency/format-currency";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import type { RouteLocale } from "@/lib/i18n/config";
import { persianSourceProps } from "@/lib/i18n/iran-places";

function safeInsurerWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Spec hard UX rule: exclusions must be highly visible — this renders them
 * in their own bordered section directly under the header, before coverage
 * benefits, never folded below or scrolled past.
 */
export function InsuranceProductDetailView({ productId }: { productId: string }) {
  const fmt = useInstantFormat();
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("insurance");

  const [product, setProduct] = useState<InsuranceProductDto | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  async function load() {
    setLoadError(null);
    setProduct(null);
    try {
      setProduct(await insuranceService.getProduct(productId));
    } catch (err) {
      setLoadError(err);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (loadError && !product) return <LoadFailure error={loadError} onRetry={load} />;
  if (!product) return <Skeleton className="h-64 w-full" aria-label={t("detail.loading")} />;
  const insurerWebsite = safeInsurerWebsite(product.providerWebsiteUrl);

  return (
    <div className="flex flex-col gap-6">
      <header className="section-head">
        <div>
          <h1>
            {product.providerName} — {product.name}
          </h1>
        </div>
        <StatusLabel tone={verificationStatusTone(product.status)}>{t(`verificationStatus.${product.status}`)}</StatusLabel>
      </header>

      <div className="split-layout">
        <div className="split-main">
          <section className="flex flex-col gap-3">
            <h2 className="text-section-title text-text-primary">{t("detail.coverageTitle")}</h2>
            <p className="text-body text-text-primary" {...persianSourceProps(product.coverageSummary, locale)}>{product.coverageSummary}</p>
            {persianSourceProps([product.coverageSummary, ...product.exclusions].join(" "), locale).lang ? <p className="text-metadata text-text-secondary">{t("detail.insurerLanguageNote")}</p> : null}
            <div className="flex flex-wrap gap-2">
              {product.coverageTypes.map((type) => (
                <span key={type} className="tag">
                  {t(`coverageType.${type}`)}
                </span>
              ))}
            </div>
            {product.termsSource ? <p className="text-metadata text-text-secondary">{t("detail.termsSource", { source: product.termsSource })}</p> : null}
          </section>
          <section className="attention-banner attention-banner--static">
            <h2 className="text-section-title text-text-primary">{t("detail.exclusionsTitle")}</h2>
            {product.exclusions.length === 0 ? (
              <p className="text-body text-text-secondary">{t("detail.exclusionsEmpty")}</p>
            ) : (
              <ul className="flex list-inside list-disc flex-col gap-1">
                {product.exclusions.map((exclusion) => (
                  <li key={exclusion} className="text-body text-text-primary" {...persianSourceProps(exclusion, locale)}>
                    {exclusion}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="split-aside">
          <section className="split-panel flex flex-col">
              {product.waitingPeriodDays !== null ? <p className="fact-line">{t("detail.waitingPeriod", { days: fmt.number(product.waitingPeriodDays) })}</p> : null}
              {product.deductibleAmountIrr !== null ? (
                <p className="fact-line">{t("detail.deductible", { amount: formatCurrency(product.deductibleAmountIrr, locale) })}</p>
              ) : null}
              {product.annualLimitIrr !== null ? <p className="fact-line">{t("detail.annualLimit", { amount: formatCurrency(product.annualLimitIrr, locale) })}</p> : null}
              {product.premiumMinIrr !== null && product.premiumMaxIrr !== null ? (
                <p className="fact-line">{t("detail.premiumRange", { min: formatCurrency(product.premiumMinIrr, locale), max: formatCurrency(product.premiumMaxIrr, locale) })}</p>
              ) : null}
          </section>
          {insurerWebsite ? (
            <a className="account-link-button" href={insurerWebsite} target="_blank" rel="noopener noreferrer">
              {t("detail.visitInsurer")}
            </a>
          ) : (
            <p className="text-metadata text-text-secondary">{t("detail.insurerWebsiteUnavailable")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
