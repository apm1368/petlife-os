"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { useAdminStore } from "@/stores/admin-store";
import { Panel, PanelTitle } from "../console-ui";

/** Fulfillment states before a courier has the parcel: the window in which staff can cancel with a full refund. */
const BEFORE_DISPATCH = ["PENDING", "AWAITING_SELLER_PREPARATION", "READY_FOR_PICKUP", null];

/** Staff cancel before dispatch (commerce.manage): full refund, fulfillment cancelled, stock returned, audited. */
export function AdminOrderCancelPanel({ orderId, cancelled, fulfillmentStatus, onDone }: { orderId: string; cancelled: boolean; fulfillmentStatus: string | null; onDone: () => void }) {
  const t = useTranslations("adminOrderCancel");
  const canManage = useAdminStore((s) => s.context?.permissions.includes("commerce.manage") === true);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage || cancelled) return null;
  if (!BEFORE_DISPATCH.includes(fulfillmentStatus)) {
    return (
      <Panel>
        <PanelTitle title={t("title")} />
        <p className="text-sm text-text-secondary">{t("afterDispatch")}</p>
      </Panel>
    );
  }

  async function cancel() {
    if (reason.trim().length < 3) return setError(t("reasonRequired"));
    setBusy(true);
    setError(null);
    try {
      await adminCommerceService.cancelOrder(orderId, reason.trim());
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t("notCancellable") : t("failed"));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelTitle title={t("title")} hint={t("hint")} />
      <label className="flex flex-col gap-1 text-sm">
        {t("reason")}
        <textarea dir="auto" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base p-2" />
      </label>
      {error ? <p role="alert" className="mt-2 text-sm text-state-urgent">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="danger" size="sm" isLoading={busy} onClick={() => void cancel()}>{t("confirm")}</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>{t("back")}</Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>{t("cancel")}</Button>
        )}
      </div>
    </Panel>
  );
}
