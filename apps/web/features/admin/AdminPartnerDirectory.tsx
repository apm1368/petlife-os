"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminProviderOrgSummaryDto, AdminSellerOrgSummaryDto, PaginatedDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { useStatusText } from "@/lib/status/use-status-text";
import { ApiError } from "@/lib/api/client";
import { adminStatusTone } from "./status-tone";

type Organization = AdminProviderOrgSummaryDto | AdminSellerOrgSummaryDto;
export function AdminPartnerDirectory({ kind }: { kind: "provider" | "seller" }) {
  const locale = useLocale(),
    t = useTranslations("admin.orgs"),
    common = useTranslations("admin.common"),
    verification = useTranslations("partnerVerification"),
    status = useStatusText();
  const permissions = useAdminStore((s) => s.context?.permissions);
  const canReview = !!permissions?.includes("verification.manage"),
    canRead = canReview || !!permissions?.includes("customer.view");
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<PaginatedDto<Organization> | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setLoading(true);
    setError(null);
    const request = kind === "provider" ? adminService.listProviders : adminService.listSellers;
    request(query, { page, pageSize: 30 })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, kind, query, page, revision]);
  const number = (value: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <h1 className="text-page-title text-text-primary">
        {t(kind === "provider" ? "providersTitle" : "sellersTitle")}
      </h1>
      {!canRead ? (
        <EmptyState title={t("forbidden")} />
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(draft.trim());
              setPage(1);
              setRevision((v) => v + 1);
            }}
          >
            <div className="min-w-0 flex-1">
              <Input
                label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
                value={draft}
                maxLength={100}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {t("search")}
            </Button>
          </form>
          {loading ? (
            <Skeleton className="h-40 w-full" aria-label={common("loading")} />
          ) : error ? (
            error instanceof ApiError && error.status === 403 ? (
              <EmptyState title={t("forbidden")} />
            ) : (
              <ErrorRecovery
                title={t("loadFailed")}
                message=""
                retryLabel={common("retry")}
                onRetry={() => setRevision((v) => v + 1)}
              />
            )
          ) : (
            result && (
              <>
                <p role="status">{t("resultCount", { count: number(result.total) })}</p>
                {result.items.length === 0 ? (
                  <EmptyState title={common("empty")} />
                ) : (
                  result.items.map((org) => (
                    <ContextSurface key={org.id} className="flex min-w-0 flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="min-w-0 text-body font-medium text-text-primary">{org.name}</span>
                        <div className="flex flex-wrap gap-2">
                          {"status" in org && (
                            <StatusLabel tone={adminStatusTone(org.status)}>
                              {status.label(org.status)}
                            </StatusLabel>
                          )}
                          <StatusLabel tone={adminStatusTone(org.verificationStatus)}>
                            {status.label(org.verificationStatus)}
                          </StatusLabel>
                        </div>
                      </div>
                      {canReview && (
                        <Link className="underline" href={`/${locale}/admin/verification/${kind}/${org.id}`}>
                          {verification("reviewCase")}
                        </Link>
                      )}
                    </ContextSurface>
                  ))
                )}
                <nav className="flex flex-wrap items-center gap-3" aria-label={t("pagination")}>
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
                    {t("previous")}
                  </Button>
                  <span>{t("page", { page: number(page) })}</span>
                  <Button
                    variant="secondary"
                    disabled={page * result.pageSize >= result.total}
                    onClick={() => setPage((v) => v + 1)}
                  >
                    {t("next")}
                  </Button>
                </nav>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
