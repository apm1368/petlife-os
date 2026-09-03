"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SellerAdjustmentReasonCode, SellerAdjustmentType } from "@petlife/types";
import type { AdminSellerFinanceSummaryDto, SellerAdjustmentDto, SellerSettlementDto } from "@petlife/types";
import { adminFinanceService } from "@/services/admin-finance.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { settlementTone } from "@/features/seller/settlement-tone";

/**
 * Admin drill-in for one seller (spec: "inspect balance/settlement,
 * calculate/review/approve/record payout... create controlled adjustment").
 * Settlement approve/payout/cancel/mark-failed themselves live on the
 * settlement detail page — this page only calculates new ones and lists
 * existing ones.
 */
export function AdminSellerFinanceDetailView({ sellerId }: { sellerId: string }) {
  const t = useTranslations("admin.sellerFinance.detail");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [summary, setSummary] = useState<AdminSellerFinanceSummaryDto | null>(null);
  const [settlements, setSettlements] = useState<SellerSettlementDto[]>([]);
  const [adjustments, setAdjustments] = useState<SellerAdjustmentDto[]>([]);
  const [error, setError] = useState(false);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [calculateError, setCalculateError] = useState<string | null>(null);

  const [adjType, setAdjType] = useState<SellerAdjustmentType>(SellerAdjustmentType.CREDIT);
  const [adjReasonCode, setAdjReasonCode] = useState<SellerAdjustmentReasonCode>(SellerAdjustmentReasonCode.MANUAL_CREDIT);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  async function load() {
    setError(false);
    try {
      const [s, settle, adj] = await Promise.all([
        adminFinanceService.getSellerFinance(sellerId),
        adminFinanceService.listSettlements(sellerId),
        adminFinanceService.listAdjustments(sellerId),
      ]);
      setSummary(s);
      setSettlements(settle);
      setAdjustments(adj);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function calculate() {
    if (!periodStart || !periodEnd) return;
    setCalculateError(null);
    try {
      const created = await adminFinanceService.calculateSettlement({ sellerOrganizationId: sellerId, periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString() });
      router.push(`/${locale}/admin/settlements/${created.id}`);
    } catch {
      setCalculateError(t("calculateFailed"));
    }
  }

  async function createAdjustment() {
    const amountIrr = Number(adjAmount);
    if (!amountIrr || !adjReason.trim()) return;
    await adminFinanceService.createAdjustment(sellerId, { type: adjType, reasonCode: adjReasonCode, amountIrr, reason: adjReason });
    setAdjAmount("");
    setAdjReason("");
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!summary) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{summary.sellerOrganization.name}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pendingIrr", "reservedIrr", "availableIrr", "paidIrr"] as const).map((key) => (
          <ContextSurface key={key} className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t(`balance.${key}`)}</span>
            <span className="text-section-title text-text-primary">{formatCurrency(summary.balance[key], locale)}</span>
          </ContextSurface>
        ))}
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("calculate.title")}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" label={t("calculate.periodStart")} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <Input type="date" label={t("calculate.periodEnd")} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <Button onClick={calculate}>{t("calculate.submit")}</Button>
        </div>
        {calculateError ? <span className="text-metadata text-state-urgent">{calculateError}</span> : null}
      </ContextSurface>

      <div className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("settlementsTitle")}</span>
        {settlements.length === 0 ? (
          <span className="text-body text-text-secondary">{t("noSettlements")}</span>
        ) : (
          settlements.map((s) => (
            <button key={s.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/settlements/${s.id}`)}>
              <ContextSurface className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-body font-medium text-text-primary">{s.reference}</span>
                  <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(s.periodEnd))}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusLabel tone={settlementTone(s.status)}>{s.status}</StatusLabel>
                  <span className="text-body text-text-primary">{formatCurrency(s.netIrr, locale)}</span>
                </div>
              </ContextSurface>
            </button>
          ))
        )}
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("adjustments.title")}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Select label={t("adjustments.type")} value={adjType} onChange={(e) => setAdjType(e.target.value as SellerAdjustmentType)} options={[{ value: "CREDIT", label: t("adjustments.CREDIT") }, { value: "DEBIT", label: t("adjustments.DEBIT") }]} />
          <Select
            label={t("adjustments.reasonCode")}
            value={adjReasonCode}
            onChange={(e) => setAdjReasonCode(e.target.value as SellerAdjustmentReasonCode)}
            options={["SHIPPING_COMPENSATION", "MANUAL_CREDIT", "MANUAL_DEBIT", "MARKETPLACE_PENALTY", "CORRECTION"].map((v) => ({ value: v, label: t(`adjustments.reasonCodes.${v}`) }))}
          />
          <Input label={t("adjustments.amount")} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
          <Input label={t("adjustments.reason")} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="min-w-[200px] flex-1" />
          <Button onClick={createAdjustment}>{t("adjustments.submit")}</Button>
        </div>
        {adjustments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">{a.reason}</span>
              <span className="text-metadata text-text-secondary">{t(`adjustments.reasonCodes.${a.reasonCode}`)} · {a.createdByAdmin.displayName}</span>
            </div>
            <span className={"text-body " + (a.type === "DEBIT" ? "text-state-urgent" : "text-text-primary")}>{a.type === "DEBIT" ? "-" : "+"}{formatCurrency(a.amountIrr, locale)}</span>
          </div>
        ))}
      </ContextSurface>
    </div>
  );
}
