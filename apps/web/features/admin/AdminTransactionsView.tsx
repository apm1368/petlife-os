"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, StatusLabel } from "@petlife/ui";
import type { AdminOrderFinancialsDto, AdminRefundApprovalDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminStatusTone } from "./status-tone";

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function AdminTransactionsView() {
  const t = useTranslations("admin.transactions");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale() as "fa" | "en";

  const [orderId, setOrderId] = useState("");
  const [financials, setFinancials] = useState<AdminOrderFinancialsDto | null>(null);
  const [error, setError] = useState(false);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [approval, setApproval] = useState<AdminRefundApprovalDto | null>(null);

  async function lookup() {
    if (!orderId.trim()) return;
    setError(false);
    try {
      setFinancials(await adminService.getOrderFinancials(orderId));
    } catch {
      setError(true);
    }
  }

  async function requestRefund() {
    const amount = Number(refundAmount);
    if (!amount || !refundReason.trim()) return;
    setApproval(await adminService.requestRefundApproval({ orderId, amount, reason: refundReason }));
  }

  async function refresh(id: string) {
    setApproval(await adminService.getRefundApproval(id));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <div className="flex items-end gap-2">
        <Input label={t("orderIdPlaceholder")} value={orderId} onChange={(e) => setOrderId(e.target.value)} className="flex-1" />
        <Button onClick={lookup}>{t("lookup")}</Button>
      </div>

      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={lookup} /> : null}

      {financials ? (
        <>
          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("paymentIntents")}</span>
            {financials.paymentIntents.map((pi) => (
              <div key={pi.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <StatusLabel tone={adminStatusTone(pi.status)}>{pi.status}</StatusLabel>
                  <span className="text-body text-text-primary">{formatCurrency(pi.amount, locale)}</span>
                </div>
                {pi.refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 ps-3">
                    <StatusLabel tone={adminStatusTone(r.status)}>{r.status}</StatusLabel>
                    <span className="text-metadata text-text-secondary">{formatCurrency(r.amount, locale)}</span>
                  </div>
                ))}
              </div>
            ))}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("ledgerEntries")}</span>
            {financials.ledgerEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <span className="text-metadata text-text-secondary">{e.accountName}</span>
                <StatusLabel tone={e.direction === "DEBIT" ? "neutral" : "attention"}>{e.direction}</StatusLabel>
                <span className="text-body text-text-primary">{formatCurrency(e.amount, locale)}</span>
              </div>
            ))}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <span className="text-section-title text-text-primary">{t("refund.title")}</span>
            <Input label={t("refund.amount")} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <Input label={t("refund.reason")} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            <Button onClick={requestRefund}>{t("refund.submit")}</Button>

            {approval ? (
              <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
                <div className="flex items-center justify-between gap-3">
                  <StatusLabel tone={adminStatusTone(approval.status)}>{t(`refund.status.${approval.status}`)}</StatusLabel>
                  <span className="text-metadata text-text-secondary">{formatDate(approval.createdAt, locale)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await adminService.approveRefund(approval.id);
                      await refresh(approval.id);
                    }}
                  >
                    {t("refund.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await adminService.rejectRefund(approval.id);
                      await refresh(approval.id);
                    }}
                  >
                    {t("refund.reject")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await adminService.executeRefund(approval.id);
                      await refresh(approval.id);
                    }}
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
