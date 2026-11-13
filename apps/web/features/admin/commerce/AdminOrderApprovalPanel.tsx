"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { useAdminStore } from "@/stores/admin-store";
import { Panel, PanelTitle } from "../console-ui";

/**
 * Approval modes: a paid order held for staff approval (status PENDING). Approve sends it to the seller (its
 * fulfillment is created then); reject refunds the customer in full on the staff-cancel path. Both need
 * commerce.manage and are audited; view-only staff see why the order is waiting.
 */
export function AdminOrderApprovalPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useTranslations("adminOrderApproval");
  const canManage = useAdminStore((s) => s.context?.permissions.includes("commerce.manage") === true);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    if (action === "reject" && reason.trim().length < 3) return setError(t("reasonRequired"));
    setBusy(action);
    setError(null);
    try {
      if (action === "approve") await adminCommerceService.approveOrder(orderId, note.trim() || undefined);
      else await adminCommerceService.rejectOrder(orderId, reason.trim());
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t("notPending") : t("failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <PanelTitle title={t("title")} hint={t("hint")} />
      {!canManage ? (
        <p className="text-sm text-text-secondary">{t("noPermission")}</p>
      ) : rejecting ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("reason")}
            <textarea dir="auto" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base p-2 text-text-primary" />
          </label>
          {error ? <p role="alert" className="mt-2 text-sm text-state-urgent">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" size="sm" isLoading={busy === "reject"} disabled={busy !== null} onClick={() => void run("reject")}>{t("confirmReject")}</Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setRejecting(false); setError(null); }}>{t("back")}</Button>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("note")}
            <textarea dir="auto" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base p-2 text-text-primary" />
          </label>
          {error ? <p role="alert" className="mt-2 text-sm text-state-urgent">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" isLoading={busy === "approve"} disabled={busy !== null} onClick={() => void run("approve")}>{t("approve")}</Button>
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => { setRejecting(true); setError(null); }}>{t("reject")}</Button>
          </div>
        </>
      )}
    </Panel>
  );
}
