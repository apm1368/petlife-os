"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { MembershipOffersDto, SubscriptionDto, SubscriptionPlanDto } from "@petlife/types";
import { SubscriptionBillingInterval } from "@petlife/types";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { entitlementLabelKey } from "./entitlement-labels";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { isRouteLocale } from "@/lib/i18n/config";
import { MembershipOffersCard } from "@/features/membership/MembershipOffersCard";
import { membershipOffersService } from "@/services/membership-offers.service";

/**
 * Plan comparison (spec: "must not visually hide Free"). FREE is rendered
 * as a normal card in the same grid, sorted by the plan's own `sortOrder` —
 * never filtered out or demoted to a footnote.
 */
export function SubscriptionPlansView() {
  const t = useTranslations("subscription");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const householdId = usePetStore((s) => s.householdId);

  const [plans, setPlans] = useState<SubscriptionPlanDto[] | null>(null);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [interval, setInterval_] = useState<SubscriptionBillingInterval>(SubscriptionBillingInterval.MONTHLY);
  const [loadFailure, setLoadFailure] = useState<"loadErrorMessage" | "loadOffline" | "loadForbidden" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [offers, setOffers] = useState<MembershipOffersDto | null>(null);
  // Checkout gift code: pre-filled from ?gift= or the offers card; the server alone decides whether it applies.
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState<{ code: string; percentOff: number } | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("gift");
    if (fromLink && /^[A-Za-z0-9-]{1,24}$/.test(fromLink)) setGiftInput(fromLink);
  }, []);

  const onOffersLoaded = useCallback((loaded: MembershipOffersDto) => {
    setOffers(loaded);
    const offered = loaded.firstPurchaseGift;
    if (!offered) return;
    // The server already said this member can use this code: show it applied (re-checked at payment).
    const fromLink = new URLSearchParams(window.location.search).get("gift");
    if (fromLink && fromLink.toUpperCase() !== offered.code.toUpperCase()) return;
    setGiftInput(offered.code);
    setGift({ code: offered.code, percentOff: offered.percentOff });
  }, []);

  async function applyGift(code: string) {
    if (!householdId || !code.trim()) return;
    setGiftError(null);
    setGiftInput(code.trim());
    const offered = offers?.firstPurchaseGift;
    if (offered && offered.code.toUpperCase() === code.trim().toUpperCase()) {
      setGift({ code: offered.code, percentOff: offered.percentOff });
      return;
    }
    setGiftBusy(true);
    try {
      const checked = await membershipOffersService.checkGift(householdId, code.trim());
      setGift({ code: checked.code, percentOff: checked.percentOff });
    } catch (err) {
      setGift(null);
      setGiftError(err instanceof ApiError && err.status === 429 ? t("offers.checkout.rateLimited") : t("offers.checkout.notApplicable"));
    } finally {
      setGiftBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoadFailure(null);
    try {
      const [plansResult, subResult] = await Promise.all([subscriptionService.getPlans(householdId), subscriptionService.getCurrent(householdId)]);
      setPlans([...plansResult].sort((a, b) => a.sortOrder - b.sortOrder));
      setSub(subResult);
    } catch (err) {
      setLoadFailure(navigator.onLine === false ? "loadOffline" : err instanceof ApiError && (err.status === 401 || err.status === 403) ? "loadForbidden" : "loadErrorMessage");
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
      setActionError(
        err instanceof ApiError && err.status === 403
          ? t("ownerOnly")
          : err instanceof ApiError && err.code === "SUBSCRIPTION_GIFT_CODE_NOT_APPLICABLE"
            ? t("offers.checkout.notApplicable")
            : err instanceof ApiError && err.code === "SUBSCRIPTION_GIFT_RATE_LIMITED"
              ? t("offers.checkout.rateLimited")
              : apiErrorText(err, locale, tCommon("genericError")),
      );
    } finally {
      setBusyPlanId(null);
    }
  }

  if (loadFailure) return <ErrorRecovery title={t("loadErrorTitle")} message={t(loadFailure)} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!householdId) return <section className="flex flex-col gap-3"><h1 className="text-page-title text-text-primary">{t("plansTitle")}</h1><p className="text-body text-text-secondary">{t("noHouseholdMessage")}</p><Button variant="secondary" onClick={() => router.push(`/${locale}/profile/household`)}>{t("openHouseholds")}</Button></section>;
  if (!plans || !sub) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const onFreePlan = !sub.price;
  const giftFor = gift ? { giftCode: gift.code } : {};
  const showGiftField = onFreePlan && (Boolean(offers?.firstPurchaseGift) || Boolean(giftInput) || Boolean(gift));
  const numberLocale = locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "ar" ? "ar" : locale === "nl" ? "nl-NL" : "en-GB";
  const currencyLocale = isRouteLocale(locale) ? locale : "en";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("plansTitle")}</h1>
      <MembershipOffersCard refreshKey={`${sub.status}:${sub.price?.id ?? ""}`} onOffersLoaded={onOffersLoaded} onApplyGift={(code) => void applyGift(code)} onTrialStarted={load} />
      {plans.length === 0 ? <p className="text-body text-text-secondary">{t("noPlans")}</p> : null}

      {showGiftField ? (
        <div className="membership-gift-field">
          <div className="membership-gift-field__row">
            <Input label={t("offers.checkout.label")} dir="ltr" maxLength={24} value={giftInput} onChange={(event) => { setGiftInput(event.target.value); setGift(null); setGiftError(null); }} />
            {gift ? (
              <Button size="sm" variant="secondary" onClick={() => { setGift(null); setGiftInput(""); }}>{t("offers.checkout.remove")}</Button>
            ) : (
              <Button size="sm" variant="secondary" isLoading={giftBusy} disabled={!giftInput.trim()} onClick={() => void applyGift(giftInput)}>{t("offers.checkout.apply")}</Button>
            )}
          </div>
          {gift ? <p className="membership-gift-field__applied" role="status">{t("offers.checkout.applied", { percent: gift.percentOff })}</p> : null}
          {gift ? <p className="text-metadata text-text-secondary">{t("offers.checkout.renewalNote")}</p> : null}
          {giftError ? <p className="text-body text-state-urgent" role="alert">{giftError}</p> : null}
        </div>
      ) : null}

      {plans.length > 0 ? <div className="flex gap-2 overflow-x-auto border-b border-border-subtle pb-2" aria-label={t("durationLabel")}>
        {(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as const).map((value) => <Button key={value} size="sm" aria-pressed={interval === SubscriptionBillingInterval[value]} variant={interval === SubscriptionBillingInterval[value] ? "primary" : "secondary"} onClick={() => setInterval_(SubscriptionBillingInterval[value])}>
          {t(`interval.${value === "MONTHLY" ? "monthly" : value === "QUARTERLY" ? "quarterly" : value === "SEMI_ANNUAL" ? "semiAnnual" : "annual"}`)}
        </Button>)}
      </div> : null}

      {actionError ? <p className="text-body text-state-urgent">{actionError}</p> : null}

      {plans.length > 0 ? <div className="flex flex-col gap-3">
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
              {locale !== "fa" && locale !== "en" ? <p className="text-metadata text-text-secondary">{t("planContentEnglish")}</p> : null}
              {(locale === "fa" ? plan.descriptionFa : plan.descriptionEn) ? <p className="text-body text-text-secondary">{locale === "fa" ? plan.descriptionFa : plan.descriptionEn}</p> : null}
              <p className="text-body font-medium text-text-primary">
                {plan.isFree ? t("free") : price ? (
                  gift && onFreePlan ? (
                    <>
                      <span className="membership-price-was">{formatCurrency(price.amount, currencyLocale)}</span>
                      {formatCurrency(price.amount - Math.floor((price.amount * gift.percentOff) / 100), currencyLocale)} <span className="text-metadata text-text-secondary">{t("offers.checkout.withGift")}</span>
                    </>
                  ) : formatCurrency(price.amount, currencyLocale)
                ) : t("notAvailableHere")}
              </p>

              <ul className="flex flex-col gap-1">
                {plan.entitlements.map((entitlement) => (
                  <li key={entitlement.key} className="text-metadata text-text-secondary">
                    {entitlementLabelKey(entitlement.key) ? t(entitlementLabelKey(entitlement.key)!) : entitlement.key}:{" "}
                    {entitlement.type === "BOOLEAN" ? (entitlement.boolValue ? t("included") : t("notIncluded")) : entitlement.limitValue === null ? t("unlimited") : entitlement.limitValue.toLocaleString(numberLocale)}
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
                      {/* One lifetime trial: hidden once used, and for the plan the free-trial card already starts. */}
                      {plan.trialDays && !offers?.freeWeek.trialUsed && !(offers?.freeWeek.status === "AVAILABLE" && offers.freeWeek.plan?.id === plan.id) ? (
                        <Button size="sm" variant="secondary" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.startTrial(householdId, plan.id))}>
                          {t("startTrial", { days: plan.trialDays })}
                        </Button>
                      ) : null}
                      <Button size="sm" isLoading={busy} onClick={() => withBusy(plan.id, () => subscriptionService.subscribe(householdId, { planId: plan.id, billingInterval: interval, ...giftFor }))}>
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
      </div> : null}
    </div>
  );
}
