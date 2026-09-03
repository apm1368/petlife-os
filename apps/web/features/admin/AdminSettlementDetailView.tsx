"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerSettlementDetailDto } from "@petlife/types";
import { adminFinanceService } from "@/services/admin-finance.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "@/features/seller/settlement-tone";

/** Admin settlement review/approve/payout (spec: "Settlement Ready -> Review -> Approve -> Mark/Process Payout -> Reconcile"). Every action button here is a real POST — the backend, not this component, is the actual authority on whether the click succeeds (permission, two-person control, threshold, transition validity all enforced server-side). */
export function AdminSettlementDetailView({ settlementId }: { settlementId: string }) {
  const t = useTranslations("admin.settlementDetail");
  const locale = useLocale() as "fa" | "en";

  const [settlement, setSettlement] = useState<SellerSettlementDetailDto | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payoutReference, setPayoutReference] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    setError(false);
    try {
      setSettlement(await adminFinanceService.getSettlement(settlementId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementId]);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await load();
    } catch {
      setActionError(t("actionFailed"));
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!settlement) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const rows = [
    { key: "gross", value: settlement.grossIrr },
    { key: "commission", value: -settlement.commissionIrr },
    { key: "refunds", value: -settlement.refundsIrr },
    { key: "adjustments", value: settlement.adjustmentsIrr },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{settlement.reference}</h1>
        <StatusLabel tone={settlementTone(settlement.status)}>{settlement.status}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <span className="text-body text-text-secondary">{t(`breakdown.${row.key}`)}</span>
            <span className="text-body text-text-primary">{formatCurrency(row.value, locale)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
          <span className="text-body font-medium text-text-primary">{t("breakdown.net")}</span>
          <span className="text-section-title text-text-primary">{formatCurrency(settlement.netIrr, locale)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-metadata text-text-secondary">{t("initiatedBy")}</span>
          <span className="text-metadata text-text-primary">{settlement.initiatedByAdmin.displayName}</span>
        </div>
        {settlement.approvedByAdmin ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-metadata text-text-secondary">{t("approvedBy")}</span>
            <span className="text-metadata text-text-primary">{settlement.approvedByAdmin.displayName}</span>
          </div>
        ) : null}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <span className="text-section-title text-text-primary">{t("actions")}</span>
        {actionError ? <span className="text-metadata text-state-urgent">{actionError}</span> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={settlement.status !== "CALCULATED"} onClick={() => run(() => adminFinanceService.approveSettlement(settlement.id))}>
            {t("approve")}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t("payoutReference")} value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} />
          <Button size="sm" disabled={settlement.status !== "CALCULATED" && settlement.status !== "APPROVED"} onClick={() => run(() => adminFinanceService.payoutSettlement(settlement.id, payoutReference || undefined))}>
            {t("payout")}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />
          <Button size="sm" variant="secondary" disabled={settlement.status !== "CALCULATED" && settlement.status !== "APPROVED"} onClick={() => reason.trim() && run(() => adminFinanceService.cancelSettlement(settlement.id, reason))}>
            {t("cancel")}
          </Button>
          <Button size="sm" variant="danger" disabled={settlement.status !== "PAID"} onClick={() => reason.trim() && run(() => adminFinanceService.markSettlementFailed(settlement.id, reason))}>
            {t("markFailed")}
          </Button>
        </div>
      </ContextSurface>

      <div className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("items", { count: settlement.items.length })}</span>
        {settlement.items.map((item) => (
          <ContextSurface key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">{item.description}</span>
              <span className="text-metadata text-text-secondary">{item.sourceType}</span>
            </div>
            <span className={"text-body " + (item.netAmount < 0 ? "text-state-urgent" : "text-text-primary")}>{formatCurrency(item.netAmount, locale)}</span>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
