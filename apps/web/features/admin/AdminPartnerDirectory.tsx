"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminPartnerServiceRowDto, AdminPartnerShopRowDto, PaginatedDto } from "@petlife/types";
import { adminPartnersService } from "@/services/admin-partners.service";
import { useAdminStore } from "@/stores/admin-store";
import { useStatusText } from "@/lib/status/use-status-text";
import { ApiError } from "@/lib/api/client";
import { intlLocale } from "@/features/admin/admin-copy";
import { DemoRecordTag } from "./DemoRecordTag";
import { adminStatusTone } from "./status-tone";

const VERIFICATION = ["NOT_STARTED", "SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "VERIFIED", "REJECTED", "SUSPENDED"];
const KINDS = ["VET_CLINIC", "VET_HOSPITAL", "VETERINARIAN", "GROOMER", "BOARDING", "SITTER", "TRAINER", "WALKER", "PET_TAXI", "MULTI_SERVICE_PROVIDER", "TRAVEL_ACCOMMODATION"];
const SHOP_STATUS = ["PENDING", "ACTIVE", "RESTRICTED", "SUSPENDED", "INACTIVE", "CLOSED"];

type Row = AdminPartnerServiceRowDto | AdminPartnerShopRowDto;

/**
 * Admin Partners directory, one per side: Services (kind="provider") and Shops
 * (kind="seller"). A business that signed up as both shows on both sides, each
 * row naming its other half. Rows open the full profile.
 */
export function AdminPartnerDirectory({ kind }: { kind: "provider" | "seller" }) {
  const locale = useLocale();
  const t = useTranslations("admin.partners");
  const common = useTranslations("admin.common");
  const types = useTranslations("providerDiscovery.providerTypes");
  const status = useStatusText();
  const permissions = useAdminStore((s) => s.context?.permissions);
  const canReview = !!permissions?.includes("verification.manage");
  const canRead = !!permissions?.some((p) => p === "verification.manage" || p === "customer.view" || p === (kind === "provider" ? "services.view" : "commerce.view"));
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [verification, setVerification] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<PaginatedDto<Row> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setResult(null);
    setError(null);
    const input = { q: q || undefined, verification: verification || undefined, page, pageSize: 30 };
    const request: Promise<PaginatedDto<Row>> =
      kind === "provider" ? adminPartnersService.listServices({ ...input, kind: filter || undefined }) : adminPartnersService.listShops({ ...input, status: filter || undefined });
    request
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [canRead, kind, q, verification, filter, page, revision]);

  const number = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);
  const base = `/${locale}/admin/${kind === "provider" ? "providers" : "sellers"}`;

  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title text-text-primary">{t(kind === "provider" ? "servicesTitle" : "shopsTitle")}</h1>
        <p className="text-metadata text-text-secondary">{t(kind === "provider" ? "servicesIntro" : "shopsIntro")}</p>
      </header>
      {!canRead ? (
        <EmptyState title={t("forbidden")} />
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(draft.trim());
              setPage(1);
              setRevision((v) => v + 1);
            }}
          >
            <div className="min-w-48 flex-1">
              <Input label={t("searchLabel")} placeholder={t("searchPlaceholder")} value={draft} maxLength={100} onChange={(event) => setDraft(event.target.value)} />
            </div>
            <Select
              label={t("verificationFilter")}
              value={verification}
              placeholder={t("all")}
              onChange={(event) => {
                setVerification(event.target.value);
                setPage(1);
              }}
              options={VERIFICATION.map((v) => ({ value: v, label: status.label(v) }))}
            />
            {kind === "provider" ? (
              <Select
                label={t("kindFilter")}
                value={filter}
                placeholder={t("all")}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                }}
                options={KINDS.map((k) => ({ value: k, label: types(k) }))}
              />
            ) : (
              <Select
                label={t("shopStatusFilter")}
                value={filter}
                placeholder={t("all")}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                }}
                options={SHOP_STATUS.map((s) => ({ value: s, label: status.label(s) }))}
              />
            )}
            <Button type="submit">{t("search")}</Button>
          </form>
          {error ? (
            error instanceof ApiError && error.status === 403 ? (
              <EmptyState title={t("forbidden")} />
            ) : (
              <ErrorRecovery title={t("loadFailed")} message="" retryLabel={common("retry")} onRetry={() => setRevision((v) => v + 1)} />
            )
          ) : !result ? (
            <Skeleton className="h-40 w-full" aria-label={common("loading")} />
          ) : (
            <>
              <p role="status">{t("resultCount", { count: number(result.total) })}</p>
              {result.items.length === 0 ? <EmptyState title={common("empty")} /> : null}
              {result.items.map((org) => (
                <ContextSurface key={org.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {org.logoUrl ? <img src={org.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : null}
                      <div className="min-w-0">
                        <Link className="text-body font-medium text-text-primary underline" href={`${base}/${org.id}`}>
                          {org.name}
                        </Link>
                        {"isDemoRecord" in org ? <DemoRecordTag isDemoRecord={org.isDemoRecord} /> : null}
                        <span className="block text-metadata text-text-secondary">
                          {"serviceKinds" in org ? `${org.serviceKinds.map((k) => types(k)).join(" · ")} · ` : ""}
                          {[org.city, org.province].filter(Boolean).join(" · ") || t("noAddress")}
                          {org.phone ? ` · ${org.phone}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {"status" in org ? <StatusLabel tone={adminStatusTone(org.status)}>{status.label(org.status)}</StatusLabel> : null}
                      <StatusLabel tone={adminStatusTone(org.verificationStatus)}>{status.label(org.verificationStatus)}</StatusLabel>
                    </div>
                  </div>
                  <p className="text-metadata text-text-secondary">
                    {"activeServices" in org
                      ? t("serviceCounts", { active: number(org.activeServices), inactive: number(org.inactiveServices) })
                      : t("offerCounts", { active: number(org.activeOffers), pending: number(org.pendingOffers) })}
                    {org.pendingDocuments ? ` · ${t("pendingDocuments", { count: number(org.pendingDocuments) })}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-3 text-metadata">
                    {"linkedShop" in org && org.linkedShop ? (
                      <Link className="underline" href={`/${locale}/admin/sellers/${org.linkedShop.id}`}>
                        {t("alsoShop", { name: org.linkedShop.name })}
                      </Link>
                    ) : null}
                    {"linkedService" in org && org.linkedService ? (
                      <Link className="underline" href={`/${locale}/admin/providers/${org.linkedService.id}`}>
                        {t("alsoService", { name: org.linkedService.name })}
                      </Link>
                    ) : null}
                    {canReview ? (
                      <Link className="underline" href={`/${locale}/admin/verification/${kind}/${org.id}`}>
                        {t("reviewKyc")}
                      </Link>
                    ) : null}
                  </div>
                </ContextSurface>
              ))}
              <nav className="flex flex-wrap items-center gap-3" aria-label={t("pagination")}>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
                  {t("previous")}
                </Button>
                <span>{t("page", { page: number(page) })}</span>
                <Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage((v) => v + 1)}>
                  {t("next")}
                </Button>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
