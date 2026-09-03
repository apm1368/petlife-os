"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { SubscriptionDto, SubscriptionPlanDto } from "@petlife/types";
import { SubscriptionBillingInterval } from "@petlife/types";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";

const ENTITLEMENT_LABEL_KEY: Record<string, string> = {
  "pets.max": "entitlement.petsMax",
  "household.members.max": "entitlement.membersMax",
  "premium.support": "entitlement.prioritySupport",
};

/**
 * Plan comparison (spec: "must not visually hide Free"). FREE is rendered
 * as a normal card in the same grid, sorted by the plan's own `sortOrder` —
 * never filtered out or demoted to a footnote.
 */
export function SubscriptionPlansView() {
  const t = useTranslations("subscription");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const householdId = usePetStore((s) => s.householdId);

  const [plans, setPlans] = useState<SubscriptionPlanDto[] | null>(null);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [interval, setInterval_] = useState<SubscriptionBillingInterval>(SubscriptionBillingInterval.MONTHLY);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    setError(false);
    try {
      const [plansResult, subResult] = await Promise.all([subscriptionService.getPlans(householdId), subscriptionService.getCurrent(householdId)]);
      setPlans([...plansResult].sort((a, b) => a.sortOrder - b.sortOrder));
      setSub(subResult);
    } catch {
      setError(true);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(planId: string, action: () => Promise<unknown>) {
    if (!householdId) return;
    setActionError(null);
    setBusyPlanId(planId);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setBusyPlanId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("plansTitle")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!plans || !sub || !householdId) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const onFreePlan = !sub.price;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("plansTitle")}</h1>

      <div className="flex gap-2">
        <Button size="sm" variant={interval === SubscriptionBillingInterval.MONTHLY ? "primary" : "secondary"} onClick={() => setInterval_(SubscriptionBillingInterval.MONTHLY)}>
          {t("interval.monthly")}
        </Button>
        <Button size="sm" variant={interval === SubscriptionBillingInterval.ANNUAL ? "primary" : "secondary"} onClick={() => setInterval_(SubscriptionBillingInterval.ANNUAL)}>
          {t("interval.annual")}
        </Button>
      </div>

      {actionError ? <p className="text-body text-state-urgent">{actionError}</p> : null}

      <div className="flex flex-col gap-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === sub.plan.id;
          const price = plan.prices.find((p) => p.billingInterval === interval && p.status === "ACTIVE");
          const busy = busyPlanId === plan.id;

          return (
            <ContextSurface key={plan.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title text-text-primary">{locale === "fa" ? plan.nameFa : plan.nameEn}</h2>
                {isCurrent ? <span className="text-metadata text-text-secondary">{t("currentPlanBadge")}</span> : null}
              </div>
              {(locale === "fa" ? plan.descriptionFa : plan.descriptionEn) ? <p className="text-body text-text-secondary">{locale === "fa" ? plan.descriptionFa : plan.descriptionEn}</p> : null}
              <p className="text-body font-medium text-text-primary">{plan.isFree ? t("free") : price ? formatCurrency(price.amount, locale === "fa" ? "fa" : "en") : t("notAvailableHere")}</p>

              <ul className="flex flex-col gap-1">
                {plan.entitlements.map((entitlement) => (
                  <li key={entitlement.key} className="text-metadata text-text-secondary">
                    {ENTITLEMENT_LABEL_KEY[entitlement.key] ? t(ENTITLEMENT_LABEL_KEY[entitlement.key]!) : entitlement.key}:{" "}
                    {entitlement.type === "BOOLEAN" ? (entitlement.boolValue ? t("included") : t("notIncluded")) : entitlement.limitValue === null ? t("unlimited") : entitlement.limitValue}
                  </li>
                ))}
              </ul>

              {isCurrent ? null : plan.isFree ? (
                <Button size="sm" variant="secondary" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.scheduleDowngrade(householdId, plan.id))}>
                  {t("downgradeToFree")}
                </Button>
              ) : !price ? null : (
                <div className="flex flex-wrap gap-2">
                  {onFreePlan ? (
                    <>
                      {plan.trialDays ? (
                        <Button size="sm" variant="secondary" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.startTrial(householdId, plan.id))}>
                          {t("startTrial", { days: plan.trialDays })}
                        </Button>
                      ) : null}
                      <Button size="sm" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.subscribe(householdId, { planId: plan.id, billingInterval: interval }))}>
                        {t("subscribe")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.upgrade(householdId, { planId: plan.id, billingInterval: interval }))}>
                        {t("upgradeNow")}
                      </Button>
                      <Button size="sm" variant="secondary" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.scheduleDowngrade(householdId, plan.id))}>
                        {t("switchAtRenewal")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </ContextSurface>
          );
        })}
      </div>
    </div>
  );
}
