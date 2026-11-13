"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminBookingMoneyService } from "@/services/admin-booking-money.service";
import { useAdminStore } from "@/stores/admin-store";

const FIELD = "w-full rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary";
const toNumber = (v: string) => Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬]/g, ""));
type Outcome = Awaited<ReturnType<typeof adminBookingMoneyService.disputeOutcome>>;

/**
 * A dispute about an order, a service booking or a stay, decided for the customer with money back: opens a finance
 * refund approval (the dispute moves to "resolved for the customer"); the approval's progress shows here.
 */
export function DisputeRefundPanel({ disputeId, subjectType, status, onResolved }: { disputeId: string; subjectType: string; status: string; onResolved?: () => void }) {
  const t = useTranslations("adminDisputeRefund");
  const locale = useLocale() as "fa" | "en" | "de" | "es";
  const canRequest = useAdminStore((s) => (s.context?.permissions ?? []).includes("finance.refund.request" as never));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setOutcome(await adminBookingMoneyService.disputeOutcome(disputeId));
    } catch {
      setOutcome(null);
    }
  }, [disputeId]);
  useEffect(() => void load(), [load]);

  if (subjectType !== "ORDER" && subjectType !== "BOOKING") return null;
  const open = status === "UNDER_REVIEW" || status === "AWAITING_EVIDENCE";

  async function submit() {
    const value = toNumber(amount);
    if (!Number.isSafeInteger(value) || value <= 0 || reason.trim().length < 5) return setMessage({ ok: false, text: t("invalid") });
    setBusy(true);
    setMessage(null);
    try {
      setOutcome(await adminBookingMoneyService.disputeRefund(disputeId, { amount: value, reason: reason.trim() }));
      setMessage({ ok: true, text: t("requested") });
      onResolved?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.status === 400 ? t("tooMuch") : t("failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContextSurface className="flex flex-col gap-2">
      <span className="text-section-title text-text-primary">{t("title")}</span>
      {outcome?.refundApproval ? (
        <p role="status" className="text-sm">{t("approval", { amount: formatCurrency(outcome.refundApproval.amount, locale), status: t(`status.${outcome.refundApproval.status}`) })}</p>
      ) : open && canRequest ? (
        <>
          <p className="text-sm text-text-secondary">{t("hint")}</p>
          <label className="flex flex-col gap-1 text-sm">
            {t("amount")}
            <input className={FIELD} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("reason")}
            <input className={FIELD} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button size="sm" className="w-fit" isLoading={busy} onClick={() => void submit()}>{t("submit")}</Button>
        </>
      ) : (
        <p className="text-sm text-text-secondary">{t("notOpen")}</p>
      )}
      {message ? <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-state-success" : "text-state-urgent"}`}>{message.text}</p> : null}
    </ContextSurface>
  );
}
