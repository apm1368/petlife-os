"use client";
import { useState, type ReactNode } from "react";
import { Button, Dialog, Input } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { useAccountCopy } from "./account-copy";

/**
 * The one confirmation grammar for consequential account actions (sign out
 * everywhere, revoke access, remove a member, cancel membership, delete the
 * account): what happens, what stays, an explicit confirm, and — for the
 * irreversible ones — a typed phrase. Errors stay in the dialog so nothing
 * fails silently.
 */
export function ConfirmActionDialog({
  open,
  onClose,
  title,
  consequences,
  keeps,
  confirmLabel,
  onConfirm,
  destructive = true,
  typedPhrase,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  consequences: string[];
  keeps?: string[];
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  destructive?: boolean;
  typedPhrase?: string;
  children?: ReactNode;
}) {
  const { t } = useAccountCopy();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setTyped("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("انجام نشد. دوباره تلاش کنید.", "That didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={title}>
      <div className="confirm-action">
        <div>
          <p className="confirm-action__label">{t("چه اتفاقی می‌افتد", "What happens")}</p>
          <ul>{consequences.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        {keeps && keeps.length > 0 ? (
          <div>
            <p className="confirm-action__label">{t("چه چیزی باقی می‌ماند", "What stays")}</p>
            <ul>{keeps.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        ) : null}
        {children}
        {typedPhrase ? (
          <Input label={t(`برای تأیید «${typedPhrase}» را بنویسید`, `Type “${typedPhrase}” to confirm`)} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" dir="ltr" />
        ) : null}
        {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
        <div className="confirm-action__buttons">
          <Button variant="ghost" onClick={close} disabled={busy}>{t("انصراف", "Cancel")}</Button>
          <Button variant={destructive ? "danger" : "primary"} isLoading={busy} disabled={Boolean(typedPhrase) && typed.trim() !== typedPhrase} onClick={confirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}
