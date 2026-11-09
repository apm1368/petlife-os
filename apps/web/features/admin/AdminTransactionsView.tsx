"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminOrderFinancialsDto, AdminRefundApprovalDto } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";
import { ApiError } from "@/lib/api/client";
import { adminService } from "@/services/admin.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminStatusTone } from "./status-tone";

function formatDate(iso: string, locale: string) {
  const intlLocale: Record<string, string> = {
    fa: "fa-IR-u-ca-persian-nu-arabext",
    en: "en-GB",
    de: "de-DE",
    es: "es-ES",
  };
  return new Intl.DateTimeFormat(intlLocale[locale] ?? "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
}

export function AdminTransactionsView() {
  const t = useTranslations("admin.transactions");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale() as RouteLocale;

  const [orderId, setOrderId] = useState("");
  const [financials, setFinancials] = useState<AdminOrderFinancialsDto | null>(null);
  const [lookupError, setLookupError] = useState<"offline" | "forbidden" | "request" | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [approval, setApproval] = useState<AdminRefundApprovalDto | null>(null);
  const [actionError, setActionError] = useState<"offline" | "forbidden" | "request" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const statusLabel = (key: string) => t.has(key) ? t(key) : t("states.unknownStatus");
  const accountLabel = (key: string) => t.has(key) ? t(key) : t("states.unknownAccount");

  function failureKind(error: unknown): "offline" | "forbidden" | "request" {
    if (error instanceof ApiError && error.status === 403) return "forbidden";
    if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
    return "request";
  }

  async function lookup() {
    if (!orderId.trim()) return;
    setLookupError(null);
    setIsLookingUp(true);
    setFinancials(null);
    setApproval(null);
    try {
      setFinancials(await adminService.getOrderFinancials(orderId));
    } catch (error) {
      setLookupError(failureKind(error));
    } finally {
      setIsLookingUp(false);
    }
  }

  async function requestRefund() {
    const amount = Number(refundAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !refundReason.trim()) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      setApproval(await adminService.requestRefundApproval({ orderId, amount, reason: refundReason }));
    } catch (error) {
      setActionError(failureKind(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refresh(id: string) {
    setApproval(await adminService.getRefundApproval(id));
  }

  async function runApprovalAction(action: "approve" | "reject" | "execute") {
    if (!approval) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      if (action === "approve") await adminService.approveRefund(approval.id);
      if (action === "reject") await adminService.rejectRefund(approval.id);
      if (action === "execute") await adminService.executeRefund(approval.id);
      await refresh(approval.id);
    } catch (error) {
      setActionError(failureKind(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <div className="flex items-end gap-2">
        <Input label={t("orderIdLabel")} placeholder={t("orderIdPlaceholder")} value={orderId} onChange={(e) => setOrderId(e.target.value)} className="flex-1" />
        <Button disabled={!orderId.trim() || isLookingUp} isLoading={isLookingUp} onClick={lookup}>{t("lookup")}</Button>
      </div>

      {lookupError === "forbidden" ? <p role="alert" className="text-metadata text-state-urgent">{t("states.accessDenied")}</p> : null}
      {lookupError === "offline" ? <ErrorRecovery title={t("states.lookupFailedTitle")} message={t("states.offline")} retryLabel={tCommon("retry")} onRetry={lookup} /> : null}
      {lookupError === "request" ? <ErrorRecovery title={t("states.lookupFailedTitle")} message={t("states.lookupFailed")} retryLabel={tCommon("retry")} onRetry={lookup} /> : null}
      {isLookingUp ? <div role="status" aria-label={t("states.loading")} className="flex flex-col gap-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-20 w-full" /></div> : null}
      {!financials && !lookupError && !isLookingUp ? <p className="text-metadata text-text-secondary">{t("states.lookupPrompt")}</p> : null}

      {financials ? (
        <>
          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("paymentIntents")}</span>
            {financials.paymentIntents.length === 0 ? <p className="text-metadata text-text-secondary">{t("states.noPaymentIntents")}</p> : null}
            {financials.paymentIntents.map((pi) => (
              <div key={pi.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <StatusLabel tone={adminStatusTone(pi.status)}>{statusLabel(`paymentStatus.${pi.status}`)}</StatusLabel>
                  <span className="text-body text-text-primary">{formatCurrency(pi.amount, locale)}</span>
                </div>
                {pi.refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 ps-3">
                    <StatusLabel tone={adminStatusTone(r.status)}>{statusLabel(`refundStatus.${r.status}`)}</StatusLabel>
                    <span className="text-metadata text-text-secondary">{formatCurrency(r.amount, locale)}</span>
                  </div>
                ))}
              </div>
            ))}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("ledgerEntries")}</span>
            {financials.ledgerEntries.length === 0 ? <p className="text-metadata text-text-secondary">{t("states.noLedgerEntries")}</p> : null}
            {financials.ledgerEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <span className="text-metadata text-text-secondary">{accountLabel(`ledgerAccount.${e.accountCode}`)}</span>
                <StatusLabel tone={e.direction === "DEBIT" ? "neutral" : "attention"}>{statusLabel(`ledgerDirection.${e.direction}`)}</StatusLabel>
                <span className="text-body text-text-primary">{formatCurrency(e.amount, locale)}</span>
              </div>
            ))}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("refund.title")}</span>
            <Input label={t("refund.amount")} type="number" min="1" step="1" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <Input label={t("refund.reason")} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            {actionError ? <p role="alert" className="text-metadata text-state-urgent">{t(actionError === "forbidden" ? "states.actionDenied" : actionError === "offline" ? "states.offline" : "states.actionFailed")}</p> : null}
            <Button isLoading={isSubmitting} disabled={isSubmitting || !Number.isSafeInteger(Number(refundAmount)) || Number(refundAmount) <= 0 || !refundReason.trim()} onClick={requestRefund}>{t("refund.submit")}</Button>

            {approval ? (
              <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
                <div className="flex items-center justify-between gap-3">
                  <StatusLabel tone={adminStatusTone(approval.status)}>{statusLabel(`refund.approvalStatus.${approval.status}`)}</StatusLabel>
                  <span className="text-metadata text-text-secondary">{formatDate(approval.createdAt, locale)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isSubmitting} isLoading={isSubmitting}
                    size="sm"
                    variant="secondary"
                    onClick={() => runApprovalAction("approve")}
                  >
                    {t("refund.approve")}
                  </Button>
                  <Button disabled={isSubmitting} isLoading={isSubmitting}
                    size="sm"
                    variant="secondary"
                    onClick={() => runApprovalAction("reject")}
                  >
                    {t("refund.reject")}
                  </Button>
                  <Button disabled={isSubmitting} isLoading={isSubmitting}
                    size="sm"
                    onClick={() => runApprovalAction("execute")}
                  >
                    {t("refund.execute")}
                  </Button>
                </div>
              </div>
            ) : null}
          </ContextSurface>
        </>
      ) : null}
    </div>
  );
}
