"use client";

import { useStatusText } from "@/lib/status/use-status-text";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminSubscriptionSummaryDto, PaginatedDto } from "@petlife/types";
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

export function AdminSubscriptionHouseholdsView() {
  const statusText = useStatusText();
  const t = useTranslations("admin.subscriptions");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<PaginatedDto<AdminSubscriptionSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const paging = useTranslations("admin.orgs");
  const number = (value: number) => value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    void adminSubscriptionService.listHouseholdSubscriptions({
      status: status ? (status as SubscriptionStatus) : undefined,
      page,
      pageSize: 50,
    }).then((response) => {
      if (current) setResult(response);
    }).catch(() => {
      if (current) setError(true);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [status, page, revision]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("householdsTitle")}</h1>

      <Select
        label={t("filterByStatus")}
        value={status}
        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        placeholder={t("allStatuses")}
        options={Object.values(SubscriptionStatus).map((s) => ({ value: s, label: statusText.label(s, "subscription") }))}
        className="max-w-64"
      />

      {loading ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : error ? (
        <ErrorRecovery title={t("householdsTitle")} message="" retryLabel={tCommon("retry")} onRetry={() => setRevision((value) => value + 1)} />
      ) : result ? <>
        <p role="status">{t("resultCount", { count: number(result.total) })}</p>
        {result.items.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {result.items.map((row) => (
        <button key={row.id} type="button" className="min-w-0 w-full text-start" onClick={() => router.push(`/${locale}/admin/subscriptions/households/${row.household.id}`)}>
          <ContextSurface className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 flex-1 flex-col break-words">
              <span className="text-body font-medium text-text-primary">{row.household.name ?? row.household.id}</span>
              <span className="text-metadata text-text-secondary">{locale === "fa" ? row.plan.nameFa : row.plan.nameEn}</span>
            </div>
            <StatusLabel tone={STATUS_TONE[row.status]}>{statusText.label(row.status, "subscription")}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
      <nav className="flex flex-wrap items-center gap-3" aria-label={paging("pagination")}>
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{paging("previous")}</Button>
        <span>{paging("page", { page: number(page) })}</span>
        <Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>{paging("next")}</Button>
      </nav>
      </> : null}
    </div>
  );
}
