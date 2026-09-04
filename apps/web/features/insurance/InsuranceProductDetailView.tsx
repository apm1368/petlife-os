"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceEligibilityResultDto, InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { ApiError } from "@/lib/api/client";
import { eligibilityStatusTone, verificationStatusTone } from "./insurance-status";

/**
 * Spec hard UX rule: exclusions must be highly visible — this renders them
 * in their own bordered section directly under the header, before coverage
 * benefits, never folded below or scrolled past.
 */
export function InsuranceProductDetailView({ productId }: { productId: string }) {
  const t = useTranslations("insurance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const petId = searchParams.get("petId") ?? undefined;

  const [product, setProduct] = useState<InsuranceProductDto | null>(null);
  const [eligibility, setEligibility] = useState<InsuranceEligibilityResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  async function load() {
    setError(null);
    try {
      setProduct(await insuranceService.getProduct(productId));
      if (petId) setEligibility(await insuranceService.checkEligibility(petId, productId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
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
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsActing(false);
    }
  }

  if (error && !product) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!product) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">
          {product.providerName} — {product.name}
        </h1>
        <StatusLabel tone={verificationStatusTone(product.status)}>{t(`verificationStatus.${product.status}`)}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2 border-2 border-state-urgent">
        <h2 className="text-section-title text-state-urgent">{t("detail.exclusionsTitle")}</h2>
        {product.exclusions.length === 0 ? (
          <p className="text-body text-text-secondary">{t("detail.exclusionsEmpty")}</p>
        ) : (
          <ul className="list-inside list-disc">
            {product.exclusions.map((exclusion) => (
              <li key={exclusion} className="text-body text-text-primary">
                {exclusion}
              </li>
            ))}
          </ul>
        )}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("detail.coverageTitle")}</h2>
        <p className="text-body text-text-primary">{product.coverageSummary}</p>
        <div className="flex flex-wrap gap-2">
          {product.coverageTypes.map((type) => (
            <StatusLabel key={type} tone="neutral">
              {t(`coverageType.${type}`)}
            </StatusLabel>
          ))}
        </div>
        {product.waitingPeriodDays !== null ? <p className="text-metadata text-text-secondary">{t("detail.waitingPeriod", { days: product.waitingPeriodDays })}</p> : null}
        {product.deductibleAmountIrr !== null ? (
          <p className="text-metadata text-text-secondary">{t("detail.deductible", { amount: product.deductibleAmountIrr.toLocaleString() })}</p>
        ) : null}
        {product.annualLimitIrr !== null ? <p className="text-metadata text-text-secondary">{t("detail.annualLimit", { amount: product.annualLimitIrr.toLocaleString() })}</p> : null}
        {product.premiumMinIrr !== null && product.premiumMaxIrr !== null ? (
          <p className="text-metadata text-text-secondary">{t("detail.premiumRange", { min: product.premiumMinIrr.toLocaleString(), max: product.premiumMaxIrr.toLocaleString() })}</p>
        ) : null}
        {product.termsSource ? <p className="text-metadata text-text-secondary">{t("detail.termsSource", { source: product.termsSource })}</p> : null}
      </ContextSurface>

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}

      {petId ? (
        <ContextSurface className="flex flex-col gap-3">
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
          ) : (
            <Skeleton className="h-8 w-full" aria-label={tCommon("loading")} />
          )}
          <Button variant="primary" isLoading={isActing} onClick={handleApply}>
            {t("detail.apply")}
          </Button>
        </ContextSurface>
      ) : null}
    </div>
  );
}
