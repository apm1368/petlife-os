"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminSubscriptionDetailDto, SubscriptionEntitlementOverrideDto } from "@petlife/types";
import { SubscriptionEntitlementType } from "@petlife/types";
import { adminSubscriptionService } from "@/services/admin-subscription.service";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** spec: "inspect household subscription/billing attempts/entitlement resolution/usage, cancel subscription, grant/revoke a controlled manual entitlement override." */
export function AdminSubscriptionHouseholdDetailView({ householdId }: { householdId: string }) {
  const t = useTranslations("admin.subscriptions");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [detail, setDetail] = useState<AdminSubscriptionDetailDto | null>(null);
  const [overrides, setOverrides] = useState<SubscriptionEntitlementOverrideDto[] | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cancelReason, setCancelReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [overrideKey, setOverrideKey] = useState("pets.max");
  const [overrideType, setOverrideType] = useState<SubscriptionEntitlementType>(SubscriptionEntitlementType.LIMIT);
  const [overrideLimit, setOverrideLimit] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [detailResult, overridesResult] = await Promise.all([adminSubscriptionService.getHouseholdSubscription(householdId), adminSubscriptionService.listOverrides(householdId)]);
      setDetail(detailResult);
      setOverrides(overridesResult);
    } catch {
      setError(true);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelSubscription() {
    setActionError(null);
    setBusy(true);
    try {
      await adminSubscriptionService.cancelHouseholdSubscription(householdId, cancelReason || undefined);
      setCancelReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("save"));
    } finally {
      setBusy(false);
    }
  }

  async function refund(billingAttemptId: string) {
    if (!refundReason.trim()) return;
    setActionError(null);
    setBusy(true);
    try {
      await adminSubscriptionService.refundBillingAttempt(billingAttemptId, refundReason.trim());
      setRefundReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("save"));
    } finally {
      setBusy(false);
    }
  }

  async function grantOverride() {
    if (!overrideKey.trim() || !overrideReason.trim()) return;
    setActionError(null);
    setBusy(true);
    try {
      await adminSubscriptionService.grantOverride({
        householdId,
        key: overrideKey.trim(),
        type: overrideType,
        limitValue: overrideType === SubscriptionEntitlementType.LIMIT ? (overrideLimit ? Number(overrideLimit) : null) : undefined,
        boolValue: overrideType === SubscriptionEntitlementType.BOOLEAN ? true : undefined,
        reason: overrideReason.trim(),
      });
      setOverrideReason("");
      setOverrideLimit("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("save"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeOverride(overrideId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await adminSubscriptionService.revokeOverride(overrideId);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("save"));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorRecovery title={t("householdDetailTitle")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!detail || !overrides) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/subscriptions/households`)}>
        {tCommon("backToList")}
      </Button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{detail.household.name ?? detail.household.id}</h1>
        <StatusLabel tone={detail.status === "ACTIVE" ? "success" : "neutral"}>{detail.status}</StatusLabel>
      </div>
      <p className="text-body text-text-secondary">{locale === "fa" ? detail.plan.nameFa : detail.plan.nameEn}</p>
      {detail.currentPeriod ? <p className="text-metadata text-text-secondary">{t("periodEndsAt", { date: formatDate(detail.currentPeriod.endAt, locale) })}</p> : null}

      {actionError ? <p className="text-body text-state-urgent">{actionError}</p> : null}

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={tCommon("reasonLabel")} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="min-w-56 flex-1" />
        <Button variant="danger" isLoading={busy} onClick={cancelSubscription}>
          {t("cancelSubscription")}
        </Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("billingAttempts")}</span>
        <Input label={tCommon("reasonLabel")} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
        {detail.billingAttempts.map((attempt) => (
          <div key={attempt.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">
                {attempt.reason} · {formatCurrency(attempt.amount, locale === "fa" ? "fa" : "en")}
              </span>
              <span className="text-metadata text-text-secondary">
                {attempt.status} · {formatDate(attempt.createdAt, locale)}
              </span>
            </div>
            {attempt.status === "SUCCEEDED" ? (
              <Button size="sm" variant="secondary" isLoading={busy} onClick={() => refund(attempt.id)}>
                {t("refund")}
              </Button>
            ) : null}
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("entitlementOverrides")}</span>
        {overrides.map((override) => (
          <div key={override.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">
                {override.key}: {override.type === "LIMIT" ? (override.limitValue ?? t("unlimitedShort")) : String(override.boolValue)}
              </span>
              <span className="text-metadata text-text-secondary">{override.reason}</span>
            </div>
            {override.active ? (
              <Button size="sm" variant="secondary" isLoading={busy} onClick={() => revokeOverride(override.id)}>
                {t("revoke")}
              </Button>
            ) : (
              <span className="text-metadata text-text-secondary">{t("revoked")}</span>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-end gap-2 pt-2">
          <Input label={t("form.entitlementKey")} value={overrideKey} onChange={(e) => setOverrideKey(e.target.value)} className="min-w-32" />
          <Select
            label={t("form.entitlementType")}
            value={overrideType}
            onChange={(e) => setOverrideType(e.target.value as SubscriptionEntitlementType)}
            options={[
              { value: SubscriptionEntitlementType.LIMIT, label: "LIMIT" },
              { value: SubscriptionEntitlementType.BOOLEAN, label: "BOOLEAN" },
            ]}
            className="min-w-32"
          />
          {overrideType === SubscriptionEntitlementType.LIMIT ? (
            <Input label={t("form.limitValue")} value={overrideLimit} onChange={(e) => setOverrideLimit(e.target.value)} className="min-w-24" />
          ) : null}
          <Input label={tCommon("reasonLabel")} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="min-w-56 flex-1" />
          <Button isLoading={busy} onClick={grantOverride}>
            {t("form.grantOverride")}
          </Button>
        </div>
      </ContextSurface>
    </div>
  );
}
