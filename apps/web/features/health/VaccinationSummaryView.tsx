"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select, Skeleton } from "@petlife/ui";
import { VaccinationStatus, type VaccinationSummaryDto } from "@petlife/types";
import { healthService } from "@/services/health.service";

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

  useEffect(() => {
    void healthService.getVaccinationSummary(petId).then((data) => {
      setSummary(data);
      setStatus(data.status);
      setNextDueDate(data.nextDueDate?.slice(0, 10) ?? "");
      setLastKnownDate(data.lastKnownDate?.slice(0, 10) ?? "");
      setNotes(data.notes ?? "");
    });
  }, [petId]);

  async function save() {
    setIsSaving(true);
    try {
      const updated = await healthService.updateVaccinationSummary(petId, {
        status,
        nextDueDate: nextDueDate || undefined,
        lastKnownDate: lastKnownDate || undefined,
        notes: notes.trim() || undefined,
      });
      setSummary(updated);
    } finally {
      setIsSaving(false);
    }
  }

  if (!summary) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <ContextSurface className="flex flex-col gap-3">
        <Select
          label={t("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as VaccinationStatus)}
          options={Object.values(VaccinationStatus).map((value) => ({
            value,
            label: tHealth(`vaccinationStatus.${value}`),
          }))}
        />
        <Input label={t("nextDueDate")} type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        <Input label={t("lastKnownDate")} type="date" value={lastKnownDate} onChange={(e) => setLastKnownDate(e.target.value)} />
        <Input label={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="primary" isLoading={isSaving} onClick={save}>
          {t("save")}
        </Button>
      </ContextSurface>
    </div>
  );
}
