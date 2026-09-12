"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { TreatmentTaskStatus, TreatmentTaskType } from "@petlife/types";
import type { HospitalizationDetailDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { vetPanelService } from "@/services/vet-panel.service";
import { TRIAGE_TONE } from "./VetClinicalDashboardView";

const TASK_TYPES: TreatmentTaskType[] = [
  TreatmentTaskType.MEDICATION,
  TreatmentTaskType.FLUID_THERAPY,
  TreatmentTaskType.MONITORING,
  TreatmentTaskType.FEEDING,
  TreatmentTaskType.WALK,
  TreatmentTaskType.PROCEDURE,
  TreatmentTaskType.SAMPLE_COLLECTION,
  TreatmentTaskType.OTHER,
];

/** The three terminal outcomes a human may record. SCHEDULED is never written back — see the service's own transition guard. */
const TASK_OUTCOMES: TreatmentTaskStatus[] = [TreatmentTaskStatus.DONE, TreatmentTaskStatus.SKIPPED, TreatmentTaskStatus.MISSED];

/**
 * The interval treatment sheet — the working document for an inpatient, and
 * the screen a nurse keeps open all shift.
 *
 * Three things it deliberately refuses to do:
 *   - it never auto-closes an overdue task. A task nobody actioned stays
 *     SCHEDULED and reads as overdue until a human states whether it was DONE,
 *     SKIPPED (a clinical decision), or MISSED (a gap in care). Collapsing
 *     those three would make the sheet useless as a record.
 *   - it never lets a recorded outcome be re-stated. Once a task carries
 *     "given at 06:10 by Dr X" the action buttons are gone; the server
 *     refuses too.
 *   - it shows no aggregate "compliance" figure. A percentage on this screen
 *     would change what people write down.
 */
export function VetTreatmentSheetView({ hospitalizationId, petId }: { hospitalizationId: string; petId: string }) {
  const t = useTranslations("vetPanel.treatmentSheet");
  const tCommon = useTranslations("common");

  const [detail, setDetail] = useState<HospitalizationDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [series, setSeries] = useState<{ type: TreatmentTaskType; title: string; detail: string; everyHours: string; occurrences: string }>({
    type: TreatmentTaskType.MEDICATION,
    title: "",
    detail: "",
    everyHours: "8",
    occurrences: "3",
  });

  async function load() {
    setError(null);
    try {
      setDetail(await vetPanelService.getHospitalization(petId, hospitalizationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId, petId]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleScheduleSeries(): Promise<void> {
    if (!series.title.trim()) return;
    await run(() =>
      vetPanelService.scheduleTaskSeries(hospitalizationId, {
        petId,
        type: series.type,
        title: series.title.trim(),
        detail: series.detail.trim() || undefined,
        // "Now" as the first dose is what a clinician means by "start it";
        // the server expands the rest of the interval from here.
        startAt: new Date().toISOString(),
        everyHours: Number(series.everyHours) || 8,
        occurrences: Number(series.occurrences) || 1,
      }),
    );
    setSeries((s) => ({ ...s, title: "", detail: "" }));
    setShowScheduler(false);
  }

  if (error && !detail) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!detail) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isAdmitted = detail.status === "ADMITTED";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-page-title text-text-primary">{detail.petName}</h1>
          <StatusLabel tone={isAdmitted ? "attention" : "neutral"}>{t(`status.${detail.status}`)}</StatusLabel>
        </div>
        <p className="text-metadata text-text-secondary">{detail.reasonForAdmission}</p>
        <div className="flex flex-wrap gap-2">
          {detail.kennelLabel ? <StatusLabel tone="neutral">{t("kennel", { label: detail.kennelLabel })}</StatusLabel> : null}
          {detail.triageLevel ? <StatusLabel tone={TRIAGE_TONE[detail.triageLevel]}>{t(`triage.${detail.triageLevel}`)}</StatusLabel> : null}
          <StatusLabel tone="neutral">{t("admittedAt", { time: new Date(detail.admittedAt).toLocaleString() })}</StatusLabel>
          {detail.dischargedAt ? <StatusLabel tone="success">{t("dischargedAt", { time: new Date(detail.dischargedAt).toLocaleString() })}</StatusLabel> : null}
        </div>
        {error ? <p className="text-body text-state-attention">{error}</p> : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <StatusLabel tone="neutral">{t("counts.scheduled", { count: detail.taskCounts.scheduled })}</StatusLabel>
        <StatusLabel tone={detail.taskCounts.overdue > 0 ? "urgent" : "success"}>{t("counts.overdue", { count: detail.taskCounts.overdue })}</StatusLabel>
        <StatusLabel tone="neutral">{t("counts.done", { count: detail.taskCounts.done })}</StatusLabel>
        {detail.taskCounts.skipped > 0 ? <StatusLabel tone="attention">{t("counts.skipped", { count: detail.taskCounts.skipped })}</StatusLabel> : null}
        {detail.taskCounts.missed > 0 ? <StatusLabel tone="urgent">{t("counts.missed", { count: detail.taskCounts.missed })}</StatusLabel> : null}
      </div>

      {isAdmitted ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowScheduler((v) => !v)}>
            {t("scheduleTreatment")}
          </Button>
          <Button
            variant="primary"
            isLoading={isBusy}
            onClick={async () => {
              const note = window.prompt(t("dischargePrompt")) ?? undefined;
              await run(() => vetPanelService.dischargePatient(petId, hospitalizationId, note || undefined));
            }}
          >
            {t("discharge")}
          </Button>
        </div>
      ) : null}

      {showScheduler && isAdmitted ? (
        <ContextSurface className="flex flex-col gap-3">
          <h2 className="text-section-title text-text-primary">{t("scheduleTreatment")}</h2>
          <Select
            label={t("taskTypeLabel")}
            value={series.type}
            onChange={(e) => setSeries((s) => ({ ...s, type: e.target.value as TreatmentTaskType }))}
            options={TASK_TYPES.map((type) => ({ value: type, label: t(`taskType.${type}`) }))}
          />
          <Input label={t("taskTitle")} value={series.title} onChange={(e) => setSeries((s) => ({ ...s, title: e.target.value }))} />
          <Input label={t("taskDetail")} value={series.detail} onChange={(e) => setSeries((s) => ({ ...s, detail: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input label={t("everyHours")} type="number" min={1} max={24} value={series.everyHours} onChange={(e) => setSeries((s) => ({ ...s, everyHours: e.target.value }))} />
            <Input label={t("occurrences")} type="number" min={1} max={96} value={series.occurrences} onChange={(e) => setSeries((s) => ({ ...s, occurrences: e.target.value }))} />
          </div>
          {/* Says plainly that this becomes individual rows, not a rule that can later shift under a nurse. */}
          <p className="text-metadata text-text-secondary">{t("seriesExplainer")}</p>
          <Button variant="primary" isLoading={isBusy} disabled={!series.title.trim()} onClick={handleScheduleSeries}>
            {t("addToSheet")}
          </Button>
        </ContextSurface>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("sheet")}</h2>
        {detail.tasks.length === 0 ? (
          <EmptyState title={t("noTasks")} description={t("noTasksDescription")} />
        ) : (
          detail.tasks.map((task) => (
            <ContextSurface key={task.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-body text-text-primary">{task.title}</span>
                  <span className="text-metadata text-text-secondary">
                    {t(`taskType.${task.type}`)} · {new Date(task.scheduledAt).toLocaleString()}
                  </span>
                </div>
                <StatusLabel tone={task.status === "DONE" ? "success" : task.status === "MISSED" ? "urgent" : task.status === "SKIPPED" ? "attention" : task.isOverdue ? "urgent" : "neutral"}>
                  {task.status === "SCHEDULED" && task.isOverdue ? t("overdue") : t(`taskStatus.${task.status}`)}
                </StatusLabel>
              </div>
              {task.detail ? <p className="text-metadata text-text-secondary">{task.detail}</p> : null}
              {task.outcomeNote ? <p className="text-body text-text-secondary">{task.outcomeNote}</p> : null}
              {task.completedAt ? (
                <p className="text-metadata text-text-secondary">{t("actionedAt", { time: new Date(task.completedAt).toLocaleString() })}</p>
              ) : null}

              {/* Action buttons exist only while the task has no recorded outcome. */}
              {task.status === "SCHEDULED" && isAdmitted ? (
                <div className="flex flex-wrap gap-2">
                  {TASK_OUTCOMES.map((status) => (
                    <Button
                      key={status}
                      variant={status === TreatmentTaskStatus.DONE ? "primary" : "secondary"}
                      isLoading={isBusy}
                      onClick={async () => {
                        const note = status === TreatmentTaskStatus.DONE ? undefined : (window.prompt(t("outcomePrompt")) ?? undefined);
                        await run(() => vetPanelService.actionTask(hospitalizationId, task.id, { petId, status, outcomeNote: note || undefined }));
                      }}
                    >
                      {t(`taskAction.${status}`)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </ContextSurface>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("vitalsDuringStay")}</h2>
        {detail.vitals.length === 0 ? (
          <EmptyState title={t("noVitals")} />
        ) : (
          detail.vitals.map((v) => (
            <ContextSurface key={v.id} className="flex flex-col gap-1">
              <span className="text-metadata text-text-secondary">{new Date(v.recordedAt).toLocaleString()}</span>
              <span className="text-body text-text-primary">
                {[
                  v.temperatureC !== null ? `T ${v.temperatureC} °C` : null,
                  v.heartRateBpm !== null ? `HR ${v.heartRateBpm}` : null,
                  v.respiratoryRateBpm !== null ? `RR ${v.respiratoryRateBpm}` : null,
                  v.painScore !== null ? `${t("pain")} ${v.painScore}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("noneRecorded")}
              </span>
            </ContextSurface>
          ))
        )}
      </section>
    </div>
  );
}
