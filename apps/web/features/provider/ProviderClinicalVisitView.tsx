"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ClinicalVisitDetailDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerClinicalService } from "@/services/provider-clinical.service";

const STATUS_TONE: Record<string, "success" | "attention" | "neutral" | "urgent"> = {
  DRAFT: "neutral",
  IN_PROGRESS: "attention",
  COMPLETED: "success",
  AMENDED: "attention",
  VOIDED: "urgent",
};

/**
 * spec: "Do not allow silent editing after completion." Notes are editable
 * inline only while the visit is IN_PROGRESS/DRAFT; once COMPLETED, the form
 * is replaced by the completed-visit notice and an Amend action that always
 * snapshots the prior content first (see ClinicalVisitService.amend).
 */
export function ProviderClinicalVisitView({ petId, visitId }: { petId: string; visitId: string }) {
  const t = useTranslations("clinicalOs.visit");
  const tCommon = useTranslations("common");

  const [visit, setVisit] = useState<ClinicalVisitDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState({ reasonForVisit: "", historyText: "", observationsText: "", assessmentText: "", planText: "" });
  const [amendReason, setAmendReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [showAmend, setShowAmend] = useState(false);
  const [showVoid, setShowVoid] = useState(false);

  async function load() {
    setError(null);
    try {
      const detail = await providerClinicalService.getVisit(petId, visitId);
      setVisit(detail);
      setNotes({
        reasonForVisit: detail.reasonForVisit ?? "",
        historyText: detail.historyText ?? "",
        observationsText: detail.observationsText ?? "",
        assessmentText: detail.assessmentText ?? "",
        planText: detail.planText ?? "",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, visitId]);

  async function handleSaveNotes(): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      await providerClinicalService.updateVisitNotes(petId, visitId, notes);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComplete(): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      await providerClinicalService.completeVisit(petId, visitId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAmend(): Promise<void> {
    if (!amendReason.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await providerClinicalService.amendVisit(petId, visitId, { ...notes, reason: amendReason.trim() });
      setAmendReason("");
      setShowAmend(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoid(): Promise<void> {
    if (!voidReason.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await providerClinicalService.voidVisit(petId, visitId, voidReason.trim());
      setShowVoid(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  if (error && !visit) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!visit) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isEditable = visit.status === "DRAFT" || visit.status === "IN_PROGRESS";
  const isCompletedLike = visit.status === "COMPLETED" || visit.status === "AMENDED";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <StatusLabel tone={STATUS_TONE[visit.status] ?? "neutral"}>{t(`status.${visit.status}`)}</StatusLabel>
      </div>
      {error ? <p className="text-body text-state-attention">{error}</p> : null}
      {isCompletedLike ? <p className="text-metadata text-text-secondary">{t("completedNotice")}</p> : null}

      <ContextSurface className="flex flex-col gap-3">
        <NoteField label={t("reasonForVisit")} value={notes.reasonForVisit} onChange={(v) => setNotes((n) => ({ ...n, reasonForVisit: v }))} disabled={!isEditable} />
        <NoteField label={t("history")} value={notes.historyText} onChange={(v) => setNotes((n) => ({ ...n, historyText: v }))} disabled={!isEditable} />
        <NoteField label={t("observations")} value={notes.observationsText} onChange={(v) => setNotes((n) => ({ ...n, observationsText: v }))} disabled={!isEditable} />
        <NoteField label={t("assessment")} value={notes.assessmentText} onChange={(v) => setNotes((n) => ({ ...n, assessmentText: v }))} disabled={!isEditable} />
        <NoteField label={t("plan")} value={notes.planText} onChange={(v) => setNotes((n) => ({ ...n, planText: v }))} disabled={!isEditable} />

        {isEditable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" isLoading={isSaving} onClick={handleSaveNotes}>
              {t("save")}
            </Button>
            <Button variant="primary" isLoading={isSaving} onClick={handleComplete}>
              {t("complete")}
            </Button>
          </div>
        ) : null}

        {isCompletedLike ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowAmend((v) => !v)}>
              {t("amend")}
            </Button>
            <Button variant="danger" onClick={() => setShowVoid((v) => !v)}>
              {t("void")}
            </Button>
          </div>
        ) : null}

        {showAmend ? (
          <div className="flex flex-col gap-2">
            <NoteField label={t("amendReason")} value={amendReason} onChange={setAmendReason} />
            <Button variant="primary" isLoading={isSaving} onClick={handleAmend} disabled={!amendReason.trim()}>
              {t("amend")}
            </Button>
          </div>
        ) : null}

        {showVoid ? (
          <div className="flex flex-col gap-2">
            <NoteField label={t("voidReason")} value={voidReason} onChange={setVoidReason} />
            <Button variant="danger" isLoading={isSaving} onClick={handleVoid} disabled={!voidReason.trim()}>
              {t("void")}
            </Button>
          </div>
        ) : null}
      </ContextSurface>

      {visit.revisions.length > 0 ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("revisionHistory")}</h2>
          {visit.revisions.map((rev) => (
            <div key={rev.id} className="flex flex-col gap-1 border-b border-border-subtle pb-2 last:border-0">
              <span className="text-metadata text-text-secondary">{new Date(rev.createdAt).toLocaleString()}</span>
              <span className="text-body text-text-primary">{rev.reason}</span>
            </div>
          ))}
        </ContextSurface>
      ) : null}
    </div>
  );
}

function NoteField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-metadata text-text-secondary">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={2}
        className="rounded-md border border-border-strong bg-surface-elevated p-3 text-body text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
      />
    </div>
  );
}
