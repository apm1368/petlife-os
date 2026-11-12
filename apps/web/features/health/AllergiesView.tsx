"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AllergySeverity, type AllergyDto } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { statusLabel } from "@/lib/status/status-labels";
import { HealthLoadFailure } from "./HealthLoadFailure";

export function AllergiesView({ petId }: { petId: string }) {
  const t = useTranslations("health.allergies");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [allergies, setAllergies] = useState<AllergyDto[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<AllergySeverity | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  async function load() {
    setLoadError(null);
    try { setAllergies(await healthService.listAllergies(petId)); }
    catch (error) { setLoadError(error); setAllergies(null); }
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
      await healthService.createAllergy(petId, {
        name: name.trim(),
        reaction: reaction.trim() || undefined,
        severity: severity || undefined,
      });
      setName("");
      setReaction("");
      setSeverity("");
      setIsAdding(false);
      await load();
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadError) return <HealthLoadFailure error={loadError} onRetry={load} />;
  if (!allergies) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {!isAdding ? (
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            {t("addAllergy")}
          </Button>
        ) : null}
      </div>

      {isAdding ? (
        <ContextSurface className="flex flex-col gap-3">
          {saveFailed ? <p role="alert" className="text-sm text-error">{t("saveFailed")}</p> : null}
          <Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input label={t("reactionOptional")} value={reaction} onChange={(e) => setReaction(e.target.value)} />
          <Select
            label={t("severityOptional")}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as AllergySeverity)}
            options={[
              { value: AllergySeverity.MILD, label: t("severity_MILD") },
              { value: AllergySeverity.MODERATE, label: t("severity_MODERATE") },
              { value: AllergySeverity.SEVERE, label: t("severity_SEVERE") },
              { value: AllergySeverity.UNKNOWN, label: t("severity_UNKNOWN") },
            ]}
            placeholder={t("severityOptional")}
          />
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

      {allergies.length === 0 && !isAdding ? <EmptyState title={t("empty")} /> : null}

      {allergies.map((allergy) => (
        <ContextSurface key={allergy.id} className="flex items-center justify-between gap-3">
          <div>
            <Link href={`/${locale}/pets/${petId}/health/allergies/${allergy.id}`} className="text-body text-text-primary underline-offset-4 hover:underline">{allergy.name}</Link>
            {allergy.reaction ? <p className="text-metadata text-text-secondary">{allergy.reaction}</p> : null}
            <p className="text-metadata text-text-secondary">{t("source")}: {statusLabel(allergy.sourceType, locale as "fa" | "en" | "de" | "es" | "ar" | "nl", "source")}</p>
          </div>
          {allergy.severity ? <StatusLabel tone="attention">{t(`severity_${allergy.severity}`)}</StatusLabel> : null}
        </ContextSurface>
      ))}
    </div>
  );
}
