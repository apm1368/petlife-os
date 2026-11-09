"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { MedicationDto } from "@petlife/types";
import { formatCount } from "@/lib/number/format-number";
import { healthService } from "@/services/health.service";
import { HealthLoadFailure } from "./HealthLoadFailure";

export function MedicationsView({ petId }: { petId: string }) {
  const t = useTranslations("health.medications");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [medications, setMedications] = useState<MedicationDto[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [unit, setUnit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  async function load() {
    setLoadError(null);
    try { setMedications(await healthService.listMedications(petId)); }
    catch (error) { setLoadError(error); setMedications(null); }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function submit() {
    if (!name.trim()) return;
    setIsSubmitting(true);
    setSaveFailed(false);
    try {
      await healthService.createMedication(petId, {
        name: name.trim(),
        dosage: dosage ? Number(dosage) : undefined,
        unit: unit.trim() || undefined,
      });
      setName("");
      setDosage("");
      setUnit("");
      setIsAdding(false);
      await load();
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadError) return <HealthLoadFailure error={loadError} onRetry={load} />;
  if (!medications) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {!isAdding ? (
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            {t("addMedication")}
          </Button>
        ) : null}
      </div>

      {isAdding ? (
        <ContextSurface className="flex flex-col gap-3">
          {saveFailed ? <p role="alert" className="text-sm text-error">{t("saveFailed")}</p> : null}
          <Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Input label={t("dosage")} type="number" value={dosage} onChange={(e) => setDosage(e.target.value)} />
            <Input label={t("unit")} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setIsAdding(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="primary" isLoading={isSubmitting} disabled={!name.trim()} onClick={submit}>
              {tCommon("save")}
            </Button>
          </div>
        </ContextSurface>
      ) : null}

      {medications.length === 0 && !isAdding ? <EmptyState title={t("empty")} /> : null}

      {medications.map((medication) => (
        <ContextSurface key={medication.id} className="flex items-center justify-between gap-3">
          <div>
            <Link dir="auto" href={`/${locale}/pets/${petId}/health/medications/${medication.id}`} className="block text-body text-text-primary underline-offset-4 hover:underline">
              {medication.name}
              {medication.dosage ? ` — ${formatCount(medication.dosage, locale)}${medication.unit ? ` ${medication.unit}` : ""}` : ""}
            </Link>
            {medication.frequencyText ? <p className="text-metadata text-text-secondary">{medication.frequencyText}</p> : null}
          </div>
          <StatusLabel tone={medication.status === "ACTIVE" ? "attention" : "neutral"}>
            {t(`status_${medication.status}`)}
          </StatusLabel>
        </ContextSurface>
      ))}
    </div>
  );
}
