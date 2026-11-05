"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetOwnershipTransferDto } from "@petlife/types";
import { petOwnershipService } from "@/services/pet-ownership.service";
import { AccountPageHeader } from "./AccountNav";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { apiErrorText } from "@/lib/errors/api-error-text";

/**
 * Pet ownership (ID-01, ID-02, ID-03, ID-05).
 *
 * The screen is built around one rule the product keeps repeating: nobody takes
 * a pet without the other party's approval. So the incoming request is the most
 * prominent thing on the page, the outgoing request shows its waiting state,
 * and every action says out loud what will happen to the health record, the
 * memories and the costs before it is taken.
 */

type Tab = "incoming" | "outgoing" | "memories";

const STATUS_COPY: Record<string, { fa: string; en: string; tone: "neutral" | "success" | "attention" | "urgent" }> = {  PENDING_REVIEW: { fa: "در انتظار پاسخ طرف دیگر", en: "Waiting for the other party", tone: "attention" },
  ACCEPTED: { fa: "انجام شد", en: "Completed", tone: "success" },
  DECLINED: { fa: "پذیرفته نشد", en: "Declined", tone: "neutral" },
  CANCELLED: { fa: "لغو شد", en: "Withdrawn", tone: "neutral" },
  EXPIRED: { fa: "مهلت تمام شد", en: "Expired", tone: "neutral" },
  DISPUTED: { fa: "اختلاف ثبت شد — مالک تغییر نکرد", en: "Disputed — ownership unchanged", tone: "urgent" },
};

const DISPOSITION_COPY: Record<string, { fa: string; en: string }> = {
  TRANSFER: { fa: "خاطرات هم همراه پت منتقل می‌شود", en: "The memories move with the pet" },
  RETAIN: { fa: "خاطرات نزد شما می‌ماند", en: "The memories stay with you" },
  COPY_READ_ONLY: { fa: "مالک جدید یک نسخهٔ فقط‌خواندنی می‌گیرد", en: "The new owner gets a read-only copy" },
};

export function PetOwnershipView() {
  const { t, locale } = useAccountCopy();
  const [tab, setTab] = useState<Tab>("incoming");
  const [incoming, setIncoming] = useState<PetOwnershipTransferDto[] | null>(null);
  const [outgoing, setOutgoing] = useState<PetOwnershipTransferDto[] | null>(null);
  const [memoryCopies, setMemoryCopies] = useState<Awaited<ReturnType<typeof petOwnershipService.listMemoryCopies>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [incomingList, outgoingList, copies] = await Promise.all([
        petOwnershipService.listIncoming(),
        petOwnershipService.listOutgoing(),
        petOwnershipService.listMemoryCopies(),
      ]);
      setIncoming(incomingList);
      setOutgoing(outgoingList);
      setMemoryCopies(copies);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => (incoming ?? []).filter((item) => item.status === "PENDING_REVIEW").length, [incoming]);

  async function act(transfer: PetOwnershipTransferDto, action: "accept" | "decline" | "cancel" | "dispute") {
    setBusy(transfer.id);
    setNotice(null);
    try {
      if (action === "accept") {
        const outcome = await petOwnershipService.acceptTransfer(transfer.id);
        setNotice(
          t(
            `«${outcome.transfer.petName}» منتقل شد. پروندهٔ سلامت همراه پت رفت و ${outcome.retainedExpenses} هزینه نزد خانوادهٔ قبلی ماند.`,
            `“${outcome.transfer.petName}” was transferred. The health record moved with the pet and ${outcome.retainedExpenses} costs stayed with the previous household.`,
          ),
        );
      } else if (action === "decline") {
        await petOwnershipService.declineTransfer(transfer.id);
        setNotice(t("انتقال انجام نشد؛ مالک ثبت‌شده همان فرد قبلی باقی ماند.", "The transfer did not happen; the registered owner remains unchanged."));
      } else if (action === "cancel") {
        await petOwnershipService.cancelTransfer(transfer.id);
        setNotice(t("درخواست شما لغو شد.", "Your request was withdrawn."));
      } else {
        await petOwnershipService.raiseDispute(transfer.id);
        setNotice(
          t(
            "اختلاف ثبت شد. طبق سیاست پلتفرم، مالک ثبت‌شده تغییر نمی‌کند تا حکم مرجع رسمی یا توافق کتبی برسد.",
            "The dispute is recorded. Per policy, the registered owner does not change until an official ruling or a written agreement arrives.",
          ),
        );
      }
      setDecision(null);
      await load();
    } catch (err) {
      setNotice(apiErrorText(err, undefined, t("انجام نشد.", "That didn't work.")));
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return (
      <ErrorRecovery
        title={t("مالکیت پت", "Pet ownership")}
        message={t("اطلاعات مالکیت بارگذاری نشد.", "Ownership didn't load.")}
        retryLabel={t("تلاش دوباره", "Retry")}
        onRetry={load}
      />
    );
  }
  if (!incoming || !outgoing || !memoryCopies) {
    return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;
  }

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "incoming", label: t("دریافتی", "Incoming"), badge: pendingCount },
    { id: "outgoing", label: t("ارسالی", "Outgoing") },
    { id: "memories", label: t("خاطرات من", "My memories") },
  ];

  return (
    <div className="account-stack">
      <AccountPageHeader
        eyebrow={t("خانواده", "HOUSEHOLD")}
        title={t("مالکیت پت", "Pet ownership")}
        description={t(
          "هر پت یک مالک اصلی دارد. انتقال مالکیت فقط با تأیید طرف دیگر انجام می‌شود.",
          "Every pet has one primary owner. A transfer only happens with the other party's approval.",
        )}
      />

      {notice ? (
        <ContextSurface>
          <p className="text-body-sm">{notice}</p>
        </ContextSurface>
      ) : null}

      <div className="flex gap-2" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-body-sm ${tab === item.id ? "bg-surface-inverse text-text-inverse" : "bg-surface-subtle text-text-secondary"}`}
          >
            {item.label}
            {item.badge ? <span className="ms-1.5">{item.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "incoming" ? (
        <TransferList
          transfers={incoming}
          emptyTitle={t("درخواستی ندارید", "No requests")}
          emptyDescription={t("وقتی کسی مالکیت پتی را به شما پیشنهاد دهد، اینجا می‌بینید.", "When someone offers you a pet, it appears here.")}
          busyId={busy}
          role="recipient"
          onAction={act}
          onDecide={setDecision}
        />
      ) : null}

      {tab === "outgoing" ? (
        <TransferList
          transfers={outgoing}
          emptyTitle={t("پیشنهادی نداده‌اید", "No proposals")}
          emptyDescription={t("برای انتقال مالکیت، از صفحهٔ پت درخواست بدهید.", "To transfer a pet, start from the pet's page.")}
          busyId={busy}
          role="proposer"
          onAction={act}
          onDecide={setDecision}
        />
      ) : null}

      {tab === "memories" ? (
        memoryCopies.length ? (
          <ul className="account-stack">
            {memoryCopies.map((copy) => (
              <li key={copy.copyId}>
                <ContextSurface>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-sm font-medium">{copy.memory.title || copy.petName || t("خاطره", "Memory")}</p>
                      <p className="text-caption text-text-secondary">
                        {copy.petName ? `${copy.petName} · ` : ""}
                        {formatAccountDate(copy.memory.occurredAt, locale)}
                      </p>
                    </div>
                    <StatusLabel tone="neutral">{t("فقط‌خواندنی", "Read-only")}</StatusLabel>
                  </div>
                </ContextSurface>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("خاطرهٔ کپی‌شده ندارید", "No copied memories")}
            description={t(
              "اگر از خانواده جدا شوید، خاطراتی که خودتان ثبت کرده‌اید به‌صورت فقط‌خواندنی نگه داشته می‌شود.",
              "If you leave a household, the memories you recorded are kept as a read-only copy.",
            )}
          />
        )
      ) : null}

      <DecisionDialog
        decision={decision}
        busy={busy !== null}
        onClose={() => setDecision(null)}
        onConfirm={(action) => {
          if (decision) void act(decision.transfer, action);
        }}
      />
    </div>
  );
}

function TransferList({
  transfers,
  emptyTitle,
  emptyDescription,
  busyId,
  role,
  onAction,
  onDecide,
}: {
  transfers: PetOwnershipTransferDto[];
  emptyTitle: string;
  emptyDescription: string;
  busyId: string | null;
  /**
   * Which side of the request this list shows. The incoming list is what the
   * recipient answers; the outgoing list is what the proposer may withdraw. The
   * API refuses the other actions, so the UI must not offer them.
   */
  role: "recipient" | "proposer";
  onAction: (transfer: PetOwnershipTransferDto, action: "accept" | "decline" | "cancel" | "dispute") => void;
  onDecide: (decision: { transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null) => void;
}) {
  const { t, locale } = useAccountCopy();
  if (!transfers.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul className="account-stack">
      {transfers.map((transfer) => {
        const status = STATUS_COPY[transfer.status] ?? STATUS_COPY.PENDING_REVIEW!;
        const disposition = DISPOSITION_COPY[transfer.memoryDisposition] ?? DISPOSITION_COPY.RETAIN!;
        return (
          <li key={transfer.id}>
            <ContextSurface>
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body-sm font-medium">{transfer.petName || t("پت", "Pet")}</p>
                    <p className="text-caption text-text-secondary">
                      {t("از", "From")} {transfer.fromDisplayName || "—"} · {t("به", "to")} {transfer.toDisplayName || "—"}
                    </p>
                  </div>
                  <StatusLabel tone={status.tone}>{t(status.fa, status.en)}</StatusLabel>
                </div>

                <p className="text-caption text-text-secondary">
                  {t(disposition.fa, disposition.en)} ·{" "}
                  {t("مهلت پاسخ تا", "Answer by")} {formatAccountDate(transfer.expiresAt, locale)}
                </p>

                {transfer.status === "PENDING_REVIEW" && role === "recipient" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "accept" })}>
                      {t("تأیید انتقال", "Approve transfer")}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "decline" })}>
                      {t("رد کردن", "Decline")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "dispute" })}>
                      {t("ثبت اختلاف", "Report a dispute")}
                    </Button>
                  </div>
                ) : null}

                {transfer.status === "PENDING_REVIEW" && role === "proposer" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={busyId === transfer.id} onClick={() => onAction(transfer, "cancel")}>
                      {t("لغو درخواست", "Withdraw request")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === transfer.id} onClick={() => onDecide({ transfer, action: "dispute" })}>
                      {t("ثبت اختلاف", "Report a dispute")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </ContextSurface>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The confirmation step. It states exactly what happens, because the cost of
 * getting this wrong is the owner losing the pet's history — so the copy names
 * the health record, the memories and the costs explicitly.
 */
function DecisionDialog({
  decision,
  busy,
  onClose,
  onConfirm,
}: {
  decision: { transfer: PetOwnershipTransferDto; action: "accept" | "decline" | "dispute" } | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (action: "accept" | "decline" | "dispute") => void;
}) {
  const { t } = useAccountCopy();
  if (!decision) return null;
  const { transfer, action } = decision;
  const disposition = DISPOSITION_COPY[transfer.memoryDisposition] ?? DISPOSITION_COPY.RETAIN!;

  const body =
    action === "accept"
      ? t(
          `با تأیید شما، «${transfer.petName}» به خانوادهٔ شما منتقل می‌شود. پروندهٔ سلامت همراه پت می‌آید. ${disposition.fa}. هزینه‌های ثبت‌شده نزد خانوادهٔ قبلی می‌ماند.`,
          `With your approval, “${transfer.petName}” moves into your household. The health record comes with it. ${disposition.en}. Recorded costs stay with the previous household.`,
        )
      : action === "decline"
        ? t(
            "با رد کردن، پت دست همان مالک ثبت‌شده می‌ماند و چیزی تغییر نمی‌کند.",
            "Declining leaves the pet with the registered owner; nothing changes.",
          )
        : t(
            "اختلاف ثبت می‌شود و مالک ثبت‌شده تغییر نمی‌کند تا حکم مرجع رسمی یا توافق کتبی برسد.",
            "The dispute is recorded and the registered owner stays until an official ruling or a written agreement arrives.",
          );

  return (
    <Dialog open onClose={onClose} title={action === "accept" ? t("تأیید انتقال مالکیت", "Approve the ownership transfer") : action === "decline" ? t("رد کردن انتقال", "Decline the transfer") : t("ثبت اختلاف", "Report a dispute")}>
      <p className="text-body-sm">{body}</p>
      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => onConfirm(action)}>
          {action === "accept" ? t("تأیید می‌کنم", "I approve") : action === "decline" ? t("رد می‌کنم", "I decline") : t("ثبت کن", "Record it")}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t("انصراف", "Cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
