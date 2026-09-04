"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminSubscriptionSummaryDto } from "@petlife/types";
import { SubscriptionStatus } from "@petlife/types";
import { adminSubscriptionService } from "@/services/admin-subscription.service";

const STATUS_TONE: Record<SubscriptionStatus, "neutral" | "success" | "attention" | "higherConcern" | "urgent"> = {
  [SubscriptionStatus.TRIALING]: "neutral",
  [SubscriptionStatus.ACTIVE]: "success",
  [SubscriptionStatus.PAST_DUE]: "attention",
  [SubscriptionStatus.GRACE_PERIOD]: "higherConcern",
  [SubscriptionStatus.CANCEL_AT_PERIOD_END]: "attention",
  [SubscriptionStatus.CANCELLED]: "neutral",
  [SubscriptionStatus.EXPIRED]: "urgent",
};

/** spec: "Admin -> Subscriptions -> Household Subscriptions, with filters and pagination (no giant unpaginated tables)." A generous single-page pageSize with a status filter — the same shape every other admin list view (AdminCustomersView, AdminSellerFinanceView) already uses. */
export function AdminSubscriptionHouseholdsView() {
  const t = useTranslations("admin.subscriptions");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<AdminSubscriptionSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const page = await adminSubscriptionService.listHouseholdSubscriptions({ status: status ? (status as SubscriptionStatus) : undefined, pageSize: 50 });
      setItems(page.items);
    } catch {
      setError(true);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("householdsTitle")}</h1>

      <Select
        label={t("filterByStatus")}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        placeholder={t("allStatuses")}
        options={Object.values(SubscriptionStatus).map((s) => ({ value: s, label: s }))}
        className="max-w-64"
      />

      {error ? <ErrorRecovery title={t("householdsTitle")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !items ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && items && items.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}

      {items?.map((row) => (
        <button key={row.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/subscriptions/households/${row.household.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{row.household.name ?? row.household.id}</span>
              <span className="text-metadata text-text-secondary">{locale === "fa" ? row.plan.nameFa : row.plan.nameEn}</span>
            </div>
            <StatusLabel tone={STATUS_TONE[row.status]}>{row.status}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
