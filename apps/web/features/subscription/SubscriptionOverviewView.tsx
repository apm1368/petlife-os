"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { StatusTone } from "@petlife/ui";
import type { ResolvedEntitlementDto, SubscriptionBillingHistoryDto, SubscriptionDto, SubscriptionUsageItemDto } from "@petlife/types";
import { SubscriptionStatus } from "@petlife/types";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { entitlementLabelKey } from "./entitlement-labels";
import { ConfirmActionDialog } from "@/features/account/ConfirmActionDialog";

const STATUS_TONE: Record<SubscriptionStatus, StatusTone> = {
  [SubscriptionStatus.TRIALING]: "neutral",
  [SubscriptionStatus.ACTIVE]: "success",
  [SubscriptionStatus.PAST_DUE]: "attention",
  [SubscriptionStatus.GRACE_PERIOD]: "higherConcern",
  [SubscriptionStatus.CANCEL_AT_PERIOD_END]: "attention",
  [SubscriptionStatus.CANCELLED]: "neutral",
  [SubscriptionStatus.EXPIRED]: "urgent",
};

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(iso));
}

/**
 * "Manage Subscription" — spec: "shows plan/status/period/renewal-
 * cancellation state/trial/entitlements/usage." Never hides that the
 * household is on FREE; a FREE household sees the exact same page shape,
 * just without period/billing rows.
 */
export function SubscriptionOverviewView() {
  const t = useTranslations("subscription");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const householdId = usePetStore((s) => s.householdId);

  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [entitlements, setEntitlements] = useState<ResolvedEntitlementDto[] | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsageItemDto[] | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [history, setHistory] = useState<SubscriptionBillingHistoryDto | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    setError(false);
    try {
      const [subResult, entitlementsResult, usageResult] = await Promise.all([
        subscriptionService.getCurrent(householdId),
        subscriptionService.getEntitlements(householdId),
        subscriptionService.getUsage(householdId),
      ]);
      setSub(subResult);
      setEntitlements(entitlementsResult);
      setUsage(usageResult);
      // Billing belongs to household owners; a member simply doesn't see it (and the actions) — the API enforces the same.
      try {
        setHistory(await subscriptionService.getBillingHistory(householdId));
        setIsOwner(true);
      } catch (err) {
        setHistory(null);
        setIsOwner(!(err instanceof ApiError && err.status === 403));
      }
    } catch {
      setError(true);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel() {
    if (!householdId) return;
    setActionError(null);
    // Errors surface inside the confirmation dialog.
    const updated = await subscriptionService.cancel(householdId);
    setSub(updated);
  }

  async function resume() {
    if (!householdId) return;
    setActionError(null);
    setActionBusy(true);
    try {
      const updated = await subscriptionService.resume(householdId);
      setSub(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setActionBusy(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!sub || !entitlements || !usage) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const usageByKey = new Map(usage.map((u) => [u.key, u]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-section-title text-text-primary">{locale === "fa" ? sub.plan.nameFa : sub.plan.nameEn}</p>
            {sub.price ? <p className="text-metadata text-text-secondary">{formatCurrency(sub.price.amount, locale === "fa" ? "fa" : "en")}</p> : null}
          </div>
          <StatusLabel tone={STATUS_TONE[sub.status]}>{t(`status.${sub.status}`)}</StatusLabel>
        </div>

        {sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt ? <p className="text-body text-text-secondary">{t("trialEndsAt", { date: formatDate(sub.trialEndsAt, locale) })}</p> : null}
        {sub.currentPeriod ? <p className="text-body text-text-secondary">{t("periodEndsAt", { date: formatDate(sub.currentPeriod.endAt, locale) })}</p> : null}
        {sub.status === SubscriptionStatus.PAST_DUE ? <p className="text-body text-state-attention">{t("pastDueWarning")}</p> : null}
        {sub.status === SubscriptionStatus.GRACE_PERIOD ? <p className="text-body text-state-higher-concern">{t("graceWarning", { date: sub.gracePeriodEndsAt ? formatDate(sub.gracePeriodEndsAt, locale) : "—" })}</p> : null}
        {sub.status === SubscriptionStatus.EXPIRED ? <p className="text-body text-text-secondary">{t("expiredExplain")}</p> : null}
        {sub.status === SubscriptionStatus.CANCELLED ? <p className="text-body text-text-secondary">{t("cancelledExplain")}</p> : null}
        {sub.status === SubscriptionStatus.TRIALING ? <p className="text-metadata text-text-secondary">{t("trialNote")}</p> : null}
        {sub.billingMode === "SANDBOX" && sub.price ? <p className="text-metadata text-text-secondary" role="note">{t("sandboxNote")}</p> : null}
        {!isOwner ? <p className="text-metadata text-text-secondary">{t("ownerOnly")}</p> : null}
        {sub.status === SubscriptionStatus.CANCEL_AT_PERIOD_END && sub.cancelEffectiveAt ? <p className="text-body text-text-secondary">{t("cancelScheduled", { date: formatDate(sub.cancelEffectiveAt, locale) })}</p> : null}
        {sub.pendingPlan ? <p className="text-body text-text-secondary">{t("downgradeScheduled", { plan: locale === "fa" ? sub.pendingPlan.nameFa : sub.pendingPlan.nameEn })}</p> : null}

        {actionError ? <p className="text-body text-state-urgent">{actionError}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" onClick={() => router.push(`/${locale}/subscription/plans`)}>
            {t("viewPlans")}
          </Button>
          {!isOwner ? null : sub.status === SubscriptionStatus.CANCEL_AT_PERIOD_END ? (
            <Button variant="secondary" isLoading={actionBusy} onClick={resume}>
              {t("resume")}
            </Button>
          ) : sub.price && sub.status !== SubscriptionStatus.CANCELLED && sub.status !== SubscriptionStatus.EXPIRED ? (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("entitlements")}</h2>
        {entitlements.map((entitlement) => {
          const label = entitlementLabelKey(entitlement.key) ? t(entitlementLabelKey(entitlement.key)!) : entitlement.key;
          const usageItem = usageByKey.get(entitlement.key);
          return (
            <div key={entitlement.key} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <span className="text-body text-text-primary">{label}</span>
              <span className="text-metadata text-text-secondary">
                {entitlement.type === "BOOLEAN"
                  ? entitlement.boolValue
                    ? t("included")
                    : t("notIncluded")
                  : usageItem
                    ? t("usageOf", { used: new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(usageItem.used), limit: usageItem.limit === null ? "∞" : new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(usageItem.limit) })
                    : entitlement.limitValue === null
                      ? t("unlimited")
                      : entitlement.limitValue}
                {entitlement.overridden ? ` · ${t("overridden")}` : ""}
              </span>
            </div>
          );
        })}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("historyTitle")}</h2>
        <p className="text-body text-text-secondary">{t("historyBody")}</p>
      </ContextSurface>

      {isOwner && history ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title text-text-primary">{t("billingTitle")}</h2>
          {history.attempts.length === 0 ? (
            <p className="text-body text-text-secondary">{t("billingEmpty")}</p>
          ) : (
            history.attempts.map((attempt) => (
              <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <span className="text-body text-text-primary">
                  {t(`attemptReason.${attempt.reason}`)} · {formatDate(attempt.createdAt, locale)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-metadata text-text-secondary">{formatCurrency(attempt.amount, locale === "fa" ? "fa" : "en")}</span>
                  <StatusLabel tone={attempt.status === "SUCCEEDED" ? "success" : attempt.status === "FAILED" ? "urgent" : "neutral"}>
                    {attempt.status === "SUCCEEDED" && sub.billingMode === "SANDBOX" ? t("attemptStatus.SIMULATED") : t(`attemptStatus.${attempt.status}`)}
                  </StatusLabel>
                </span>
              </div>
            ))
          )}
        </ContextSurface>
      ) : null}

      {confirmCancel ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirmCancel(false)}
          title={t("cancelDialogTitle")}
          consequences={[t("cancelConsequence1", { date: sub.currentPeriod ? formatDate(sub.currentPeriod.endAt, locale) : "—" }), t("cancelConsequence2")]}
          keeps={[t("cancelKeeps"), t("cancelKeeps2", { date: sub.currentPeriod ? formatDate(sub.currentPeriod.endAt, locale) : "—" })]}
          confirmLabel={t("cancelConfirm")}
          onConfirm={cancel}
        />
      ) : null}
    </div>
  );
}
