"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { SourceType, type ConditionDto } from "@petlife/types";
import { healthService } from "@/services/health.service";

export function ConditionsView({ petId }: { petId: string }) {
  const t = useTranslations("health.conditions");
  const tCommon = useTranslations("common");
  const [conditions, setConditions] = useState<ConditionDto[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setConditions(await healthService.listConditions(petId));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function submit() {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await healthService.createCondition(petId, { name: name.trim(), notes: notes.trim() || undefined });
      setName("");
      setNotes("");
      setIsAdding(false);
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!conditions) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {!isAdding ? (
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            {t("addCondition")}
          </Button>
        ) : null}
      </div>

      {isAdding ? (
        <ContextSurface className="flex flex-col gap-3">
          <Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input label={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
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

      {conditions.length === 0 && !isAdding ? <EmptyState title={t("empty")} /> : null}

      {conditions.map((condition) => (
        <ContextSurface key={condition.id} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-body text-text-primary">{condition.name}</p>
            {condition.notes ? <p className="text-metadata text-text-secondary line-clamp-1">{condition.notes}</p> : null}
          </div>
          <StatusLabel tone={condition.status === "ACTIVE" ? "attention" : "neutral"}>
            {t(`status_${condition.status}`)}
          </StatusLabel>
          {condition.sourceType !== SourceType.OWNER ? (
            <span className="text-metadata text-text-disabled">{condition.sourceType}</span>
          ) : null}
        </ContextSurface>
      ))}
    </div>
  );
}
