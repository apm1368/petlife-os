"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select, Skeleton } from "@petlife/ui";
import { VaccinationStatus, type VaccinationSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { DateField } from "@/features/shared/date-picker/DateField";
import { HealthLoadFailure } from "./HealthLoadFailure";

export function VaccinationSummaryView({ petId }: { petId: string }) {
  const t = useTranslations("health.vaccinationSummary");
  const tHealth = useTranslations("health");
  const tCommon = useTranslations("common");
  const [summary, setSummary] = useState<VaccinationSummaryDto | null>(null);
  const [status, setStatus] = useState<VaccinationStatus>(VaccinationStatus.INCOMPLETE);
  const [nextDueDate, setNextDueDate] = useState("");
  const [lastKnownDate, setLastKnownDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await healthService.getVaccinationSummary(petId);
      setSummary(data);
      setStatus(data.status);
      setNextDueDate(data.nextDueDate?.slice(0, 10) ?? "");
      setLastKnownDate(data.lastKnownDate?.slice(0, 10) ?? "");
      setNotes(data.notes ?? "");
    } catch (error) {
      setLoadError(error);
      setSummary(null);
    }
  }, [petId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setIsSaving(true);
    setSaveFailed(false);
    try {
      const updated = await healthService.updateVaccinationSummary(petId, {
        status,
        nextDueDate: nextDueDate || undefined,
        lastKnownDate: lastKnownDate || undefined,
        notes: notes.trim() || undefined,
      });
      setSummary(updated);
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) return <HealthLoadFailure error={loadError} onRetry={load} />;
  if (!summary) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <ContextSurface className="flex flex-col gap-3">
        {saveFailed ? <p role="alert" className="text-sm text-error">{t("saveFailed")}</p> : null}
        <Select
          label={t("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as VaccinationStatus)}
          options={Object.values(VaccinationStatus).map((value) => ({
            value,
            label: tHealth(`vaccinationStatus.${value}`),
          }))}
        />
        <DateField label={t("nextDueDate")} value={nextDueDate} onChange={setNextDueDate} />
        <DateField label={t("lastKnownDate")} value={lastKnownDate} onChange={setLastKnownDate} max={new Date().toISOString().slice(0, 10)} />
        <Input label={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="primary" isLoading={isSaving} onClick={save}>
          {t("save")}
        </Button>
      </ContextSurface>
    </div>
  );
}
