"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AllergySeverity, type AllergyDto } from "@petlife/types";
import { healthService } from "@/services/health.service";

export function AllergiesView({ petId }: { petId: string }) {
  const t = useTranslations("health.allergies");
  const tCommon = useTranslations("common");
  const [allergies, setAllergies] = useState<AllergyDto[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<AllergySeverity | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setAllergies(await healthService.listAllergies(petId));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function submit() {
    if (!name.trim()) return;
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  }

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
            <p className="text-body text-text-primary">{allergy.name}</p>
            {allergy.reaction ? <p className="text-metadata text-text-secondary">{allergy.reaction}</p> : null}
            <p className="text-metadata text-text-secondary">{t("source")}: {allergy.sourceType}</p>
          </div>
          {allergy.severity ? <StatusLabel tone="attention">{t(`severity_${allergy.severity}`)}</StatusLabel> : null}
        </ContextSurface>
      ))}
    </div>
  );
}
