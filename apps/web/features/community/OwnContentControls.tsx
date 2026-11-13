"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { apiErrorText } from "@/lib/errors/api-error-text";

/**
 * M6 — the author's own edit and delete on a post or comment. Shown only on content the API marks `isMine`;
 * the API refuses anyone else anyway. Deleting asks once, inline, before it happens.
 */
export function OwnContentControls({ kind, title, body, canEdit = true, onSave, onDelete }: {
  kind: "post" | "comment";
  title?: string | null;
  body: string;
  canEdit?: boolean;
  onSave: (values: { title?: string; body: string }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const t = useTranslations("community.own");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [mode, setMode] = useState<"idle" | "edit" | "confirm">("idle");
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const [draftBody, setDraftBody] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode("idle");
    } catch (err) {
      setError(apiErrorText(err, locale, tCommon("genericError")));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <div className="flex flex-col gap-2">
        {kind === "post" ? (
          <label className="flex flex-col gap-1 text-metadata text-text-secondary">
            {t("titleLabel")}
            <input dir="auto" maxLength={200} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="h-11 rounded-md border border-border-subtle bg-surface-base px-2 text-body text-text-primary" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-metadata text-text-secondary">
          {t("bodyLabel")}
          <textarea dir="auto" maxLength={kind === "post" ? 5000 : 2000} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="min-h-28 rounded-md border border-border-subtle bg-surface-base p-2 text-body text-text-primary" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" isLoading={busy} disabled={!draftBody.trim()} onClick={() => void run(() => onSave(kind === "post" ? { title: draftTitle, body: draftBody } : { body: draftBody }))}>{t("save")}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setDraftTitle(title ?? ""); setDraftBody(body); setMode("idle"); setError(null); }}>{t("cancel")}</Button>
        </div>
        {error ? <p className="text-metadata text-state-urgent" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {mode === "confirm" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle p-2" role="group" aria-label={t(kind === "post" ? "confirmPost" : "confirmComment")}>
          <span className="text-metadata text-text-primary">{t(kind === "post" ? "confirmPost" : "confirmComment")}</span>
          <Button variant="danger" size="sm" isLoading={busy} onClick={() => void run(onDelete)}>{t("deleteYes")}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("idle")}>{t("cancel")}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canEdit ? <Button variant="secondary" size="sm" onClick={() => { setDraftTitle(title ?? ""); setDraftBody(body); setMode("edit"); }}>{t("edit")}</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => setMode("confirm")}>{t("delete")}</Button>
        </div>
      )}
      {error ? <p className="text-metadata text-state-urgent" role="alert">{error}</p> : null}
    </div>
  );
}
