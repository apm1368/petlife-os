"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import {
  SellerOfferModerationStatus,
  type AdminSellerOfferModerationDto,
  type PaginatedDto,
} from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { AdminCommerceNav } from "@/features/admin/commerce/AdminCommerceViews";
import { EmptyRow, TableWrap, Td, Th } from "@/features/admin/console-ui";

const STATUSES: SellerOfferModerationStatus[] = [
  SellerOfferModerationStatus.PENDING_REVIEW,
  SellerOfferModerationStatus.APPROVED,
  SellerOfferModerationStatus.REJECTED,
];

function tone(status: SellerOfferModerationStatus): "attention" | "success" | "urgent" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "urgent";
  return "attention";
}

export function AdminProductModerationView() {
  const locale = useLocale() as "fa" | "en";
  const t = useTranslations("adminCommerce.productModeration");
  const [status, setStatus] = useState<SellerOfferModerationStatus>(
    SellerOfferModerationStatus.PENDING_REVIEW,
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminSellerOfferModerationDto> | null>(null);
  const [detail, setDetail] = useState<AdminSellerOfferModerationDto | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      setData(
        await adminCommerceService.listSellerOffersForModeration({
          status,
          q: query.trim() || undefined,
          page,
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setActionFailed(false);
    try {
      setDetail(await adminCommerceService.getSellerOfferForModeration(id));
      setReason("");
    } catch {
      setActionFailed(true);
    }
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!detail || reason.trim().length < 3) return;
    setActing(true);
    setActionFailed(false);
    try {
      await adminCommerceService.decideSellerOfferModeration(
        detail.id,
        decision,
        reason.trim(),
        detail.updatedAt,
      );
      setDetail(null);
      setReason("");
      await load();
    } catch {
      setActionFailed(true);
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-page-title text-text-primary">{t("title")}</h1>
      <AdminCommerceNav />
      <p className="mb-4 text-body-sm text-text-secondary">{t("subtitle")}</p>

      <ContextSurface className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label={t("status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as SellerOfferModerationStatus);
            setPage(1);
          }}
          options={STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
        />
        <Input
          label={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-64"
        />
        <Button
          onClick={() => {
            setPage(1);
            void load();
          }}
          disabled={busy}
        >
          {t("filter")}
        </Button>
      </ContextSurface>

      {failed ? (
        <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />
      ) : null}
      {!failed && !data ? <Skeleton className="h-64 w-full" /> : null}
      {!failed && data ? (
        <ContextSurface>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>{t("product")}</Th>
                  <Th>{t("seller")}</Th>
                  <Th>{t("price")}</Th>
                  <Th>{t("status")}</Th>
                  <Th>{t("createdAt")}</Th>
                  <Th>{t("actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <EmptyRow colSpan={6} label={t("emptyDescription")} />
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <Td>
                        <span className="font-medium">{row.product.title}</span>
                        <span className="block text-text-secondary">
                          {row.variant.title ?? row.variant.sku}
                        </span>
                      </Td>
                      <Td>{row.sellerOrganization.name}</Td>
                      <Td>{formatCurrency(row.priceAmount, locale)}</Td>
                      <Td>
                        <StatusLabel tone={tone(row.moderationStatus)}>
                          {t(`statuses.${row.moderationStatus}`)}
                        </StatusLabel>
                      </Td>
                      <Td>
                        {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(row.createdAt))}
                      </Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => void open(row.id)}>
                          {t("review")}
                        </Button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-metadata text-text-secondary">{t("total", { count: data.total })}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        </ContextSurface>
      ) : null}

      {detail ? (
        <ContextSurface className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-section-title text-text-primary">{detail.product.title}</h2>
              <p className="text-body-sm text-text-secondary">
                {detail.variant.title ?? detail.variant.sku} · {detail.sellerOrganization.name}
              </p>
            </div>
            <StatusLabel tone={tone(detail.moderationStatus)}>
              {t(`statuses.${detail.moderationStatus}`)}
            </StatusLabel>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-metadata text-text-secondary">{t("price")}</dt>
              <dd>{formatCurrency(detail.priceAmount, locale)}</dd>
            </div>
            <div>
              <dt className="text-metadata text-text-secondary">{t("available")}</dt>
              <dd>{detail.availableQuantity.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</dd>
            </div>
            <div>
              <dt className="text-metadata text-text-secondary">{t("sku")}</dt>
              <dd>{detail.sellerSku ?? detail.variant.sku}</dd>
            </div>
            <div>
              <dt className="text-metadata text-text-secondary">{t("repeatDelivery")}</dt>
              <dd>{detail.repeatDeliveryEligible ? detail.repeatIntervalsDays.join("، ") : t("no")}</dd>
            </div>
          </dl>
          {detail.moderationReason ? (
            <p className="mt-3 text-body-sm text-text-secondary">
              {t("previousReason")}: {detail.moderationReason}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            <Input
              label={t("reason")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("reasonPlaceholder")}
              errorMessage={reason.length > 0 && reason.trim().length < 3 ? t("reasonTooShort") : undefined}
            />
            {actionFailed ? (
              <p role="alert" className="text-metadata text-state-urgent">
                {t("actionFailed")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void decide("APPROVED")}
                isLoading={acting}
                disabled={reason.trim().length < 3 || detail.moderationStatus !== "PENDING_REVIEW"}
              >
                {t("approve")}
              </Button>
              <Button
                variant="danger"
                onClick={() => void decide("REJECTED")}
                isLoading={acting}
                disabled={reason.trim().length < 3 || detail.moderationStatus !== "PENDING_REVIEW"}
              >
                {t("reject")}
              </Button>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                {t("close")}
              </Button>
            </div>
          </div>
        </ContextSurface>
      ) : null}
    </div>
  );
}
