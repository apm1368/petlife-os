"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocalizedRouter as useRouter } from "@/features/navigation/localized-link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceEligibilityResultDto, InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { eligibilityStatusTone, verificationStatusTone } from "./insurance-status";
import { formatCurrency } from "@/lib/currency/format-currency";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { apiErrorText } from "@/lib/errors/api-error-text";
import type { RouteLocale } from "@/lib/i18n/config";

/**
 * Spec hard UX rule: exclusions must be highly visible — this renders them
 * in their own bordered section directly under the header, before coverage
 * benefits, never folded below or scrolled past.
 */
export function InsuranceProductDetailView({ productId }: { productId: string }) {
  const fmt = useInstantFormat();
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("insurance");
  const router = useRouter();
  const searchParams = useSearchParams();
  const petId = searchParams.get("petId") ?? undefined;

  const [product, setProduct] = useState<InsuranceProductDto | null>(null);
  const [eligibility, setEligibility] = useState<InsuranceEligibilityResultDto | null>(null);
  const [eligibilityLoadFailed, setEligibilityLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isActing, setIsActing] = useState(false);

  async function load() {
    setError(null);
    setLoadError(null);
    setEligibilityLoadFailed(false);
    setProduct(null);
    setEligibility(null);
    try {
      setProduct(await insuranceService.getProduct(productId));
    } catch (err) {
      setLoadError(err);
      return;
    }
    if (petId) {
      try {
        setEligibility(await insuranceService.checkEligibility(petId, productId));
      } catch {
        setEligibilityLoadFailed(true);
      }
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, petId]);

  async function handleApply(): Promise<void> {
    if (!petId) return;
    setIsActing(true);
    setError(null);
    try {
      const application = await insuranceService.createApplication(petId, productId);
      router.push(`/pets/${petId}/insurance?applicationId=${application.id}`);
    } catch (err) {
      setError(locale === "fa" || locale === "en" ? apiErrorText(err, locale, t("detail.applyFailed")) : t("detail.applyFailed"));
    } finally {
      setIsActing(false);
    }
  }

  if (loadError && !product) return <LoadFailure error={loadError} onRetry={load} />;
  if (!product) return <Skeleton className="h-64 w-full" aria-label={t("detail.loading")} />;

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
            <p className="text-body text-text-primary">{product.coverageSummary}</p>
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
                  <li key={exclusion} className="text-body text-text-primary">
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
          {error ? <p className="text-body text-state-urgent">{error}</p> : null}
          {petId ? (
            <section className="split-section flex flex-col gap-3">
              <h2 className="text-section-title text-text-primary">{t("eligibility.sectionTitle")}</h2>
              {eligibility ? (
                <>
                  <StatusLabel tone={eligibilityStatusTone(eligibility.status)}>{t(`eligibilityStatus.${eligibility.status}`)}</StatusLabel>
                  {eligibility.reasons.map((reason) => (
                    <p key={reason} className="text-metadata text-text-secondary">
                      {t(`eligibility.reasons.${reason}`)}
                    </p>
                  ))}
                  <p className="text-metadata text-text-secondary">{t("eligibility.disclaimer")}</p>
                </>
              ) : eligibilityLoadFailed ? (
                <div role="alert" className="flex flex-col gap-2">
                  <p className="text-metadata text-state-urgent">{t("eligibility.loadFailed")}</p>
                  <Button variant="secondary" onClick={() => void load()}>{t("eligibility.retry")}</Button>
                </div>
              ) : (
                <Skeleton className="h-8 w-full" aria-label={t("eligibility.loading")} />
              )}
              <Button variant="primary" isLoading={isActing} onClick={handleApply}>
                {t("detail.apply")}
              </Button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
