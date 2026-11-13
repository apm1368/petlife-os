"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Skeleton } from "@petlife/ui";
import type { AdminBookingMoneyDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminBookingMoneyService, type StaffRefundChoice } from "@/services/admin-booking-money.service";
import { useAdminStore } from "@/stores/admin-store";
import { DetailRow, Panel, PanelTitle, Tag } from "../console-ui";

const NO_PERMISSIONS: readonly string[] = [];
const FIELD = "w-full rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const CHOICES: StaffRefundChoice[] = ["POLICY", "FULL", "AMOUNT", "NONE"];
const toNumber = (v: string) => Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬]/g, ""));

/**
 * Staff cancel and refund on an admin service-booking or stay page. Cancelling follows the booking's own lifecycle;
 * any money goes back only through a finance refund approval (second admin above the threshold), listed here.
 */
export function StaffBookingMoneyPanel({ kind, bookingId, onChanged }: { kind: "BOOKING" | "TRAVEL_BOOKING"; bookingId: string; onChanged?: () => void }) {
  const t = useTranslations("adminBookingMoney");
  const locale = useLocale();
  const permissions: readonly string[] = useAdminStore((s) => s.context?.permissions) ?? NO_PERMISSIONS;
  const canCancel = permissions.includes(kind === "BOOKING" ? "services.manage" : "travel.manage");
  const canRefund = permissions.includes("finance.refund.request");
  const [money, setMoney] = useState<AdminBookingMoneyDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"cancel" | "refund" | null>(null);
  const [choice, setChoice] = useState<StaffRefundChoice>("POLICY");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setMoney(await adminBookingMoneyService.money(kind, bookingId));
    } catch {
      setFailed(true);
    }
  }, [kind, bookingId]);
  useEffect(() => void load(), [load]);

  const irr = (n: number) => formatCurrency(n, locale as "fa" | "en" | "de" | "es" | "ar" | "nl");

  function reset() {
    setMode(null);
    setChoice("POLICY");
    setAmount("");
    setReason("");
    setConfirmed(false);
  }

  async function submit() {
    if (reason.trim().length < 3 || !confirmed) return setMessage({ ok: false, text: t("needReason") });
    const value = toNumber(amount);
    if ((mode === "refund" || choice === "AMOUNT") && (!Number.isSafeInteger(value) || value <= 0)) return setMessage({ ok: false, text: t("needAmount") });
    setBusy(true);
    setMessage(null);
    try {
      const next = mode === "cancel"
        ? await adminBookingMoneyService.cancel(kind, bookingId, { reason: reason.trim(), refund: choice, ...(choice === "AMOUNT" ? { amount: value } : {}) })
        : await adminBookingMoneyService.refund(kind, bookingId, { amount: value, reason: reason.trim() });
      setMoney(next);
      setMessage({ ok: true, text: mode === "cancel" ? t("cancelled") : t("refundRequested") });
      reset();
      onChanged?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.status === 403 ? t("forbidden") : e instanceof ApiError && e.status === 400 ? t("tooMuch") : t("failed") });
    } finally {
      setBusy(false);
    }
  }

  if (failed) return null;
  if (!money) return <Skeleton className="h-32 w-full" />;
  return (
    <Panel>
      <PanelTitle title={t("title")} hint={t("hint")} />
      <DetailRow label={t("paid")}>{irr(money.paidIrr)}</DetailRow>
      <DetailRow label={t("refunded")}>{irr(money.refundedIrr)}</DetailRow>
      <DetailRow label={t("refundable")}>{irr(money.refundableIrr)}</DetailRow>
      <DetailRow label={t("policy")}>{irr(money.policyRefundIrr)}</DetailRow>
      {money.approvals.length ? (
        <div className="mt-2 flex flex-col gap-1 text-sm">
          {money.approvals.map((a) => (
            <p key={a.id}>
              <Tag tone={a.status === "EXECUTED" ? "success" : a.status === "REJECTED" ? "urgent" : "attention"}>{t(`approvalStatus.${a.status}`)}</Tag> {irr(a.amount)} · {a.reason}{" "}
              <Link className="underline" href={`/${locale}/admin/transactions/refund-approvals`}>{t("openQueue")}</Link>
            </p>
          ))}
        </div>
      ) : null}
      {message ? <p role={message.ok ? "status" : "alert"} className={`mt-2 text-sm ${message.ok ? "text-state-success" : "text-state-urgent"}`}>{message.text}</p> : null}
      {mode === null ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canCancel && money.cancellable ? <Button size="sm" variant="danger" onClick={() => { setChoice(canRefund ? "POLICY" : "NONE"); setMode("cancel"); }}>{t("cancel")}</Button> : null}
          {canRefund && money.refundableIrr > 0 ? <Button size="sm" variant="secondary" onClick={() => setMode("refund")}>{t("refund")}</Button> : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-md border border-border-subtle p-3">
          {mode === "cancel" ? (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-bold">{t("refundChoice")}</legend>
              {CHOICES.filter((c) => c === "NONE" || canRefund).map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="radio" name={`refund-${bookingId}`} checked={choice === c} onChange={() => setChoice(c)} />
                  {t(`choice.${c}`, { policy: irr(money.policyRefundIrr), full: irr(money.refundableIrr) })}
                </label>
              ))}
            </fieldset>
          ) : null}
          {mode === "refund" || choice === "AMOUNT" ? (
            <label className="flex flex-col gap-1 text-sm">
              {t("amount")}
              <input className={FIELD} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            {t("reason")}
            <input className={FIELD} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {mode === "cancel" ? t("confirmCancel") : t("confirmRefund")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={mode === "cancel" ? "danger" : "primary"} isLoading={busy} onClick={() => void submit()}>{mode === "cancel" ? t("submitCancel") : t("submitRefund")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>{t("back")}</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
