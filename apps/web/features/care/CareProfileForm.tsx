"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import type { CareProfileDto } from "@petlife/types";
import { careProfileService, type UpdateCareProfileInput } from "@/services/care-profile.service";

const FIELDS: { key: keyof UpdateCareProfileInput; labelKey: string }[] = [
  { key: "temperamentText", labelKey: "temperament" },
  { key: "aroundPeopleText", labelKey: "aroundPeople" },
  { key: "aroundAnimalsText", labelKey: "aroundAnimals" },
  { key: "leashBehaviorText", labelKey: "leashBehavior" },
  { key: "handlingSensitivityText", labelKey: "handlingSensitivity" },
  { key: "feedingRoutineText", labelKey: "feedingRoutine" },
  { key: "toiletRoutineText", labelKey: "toiletRoutine" },
  { key: "separationBehaviorText", labelKey: "separationBehavior" },
  { key: "specialInstructionsText", labelKey: "specialInstructions" },
];

/** Readable free-text sections, not a checkbox wall. */
export function CareProfileForm({
  petId,
  profile,
  onSaved,
  onCancel,
}: {
  petId: string;
  profile: CareProfileDto;
  onSaved: (updated: CareProfileDto) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("care.profile");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((field) => [field.key, profile[field.key] ?? ""])),
  );
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    try {
      const input: UpdateCareProfileInput = Object.fromEntries(
        FIELDS.map((field) => [field.key, values[field.key]?.trim() || undefined]),
      );
      const updated = await careProfileService.upsert(petId, input);
      onSaved(updated);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("edit")}</h1>
      {FIELDS.map((field) => (
        <ContextSurface key={field.key} className="flex flex-col gap-2">
          <label htmlFor={field.key} className="text-section-title text-text-primary">
            {t(field.labelKey)}
          </label>
          <textarea
            id={field.key}
            value={values[field.key] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            rows={2}
            className="rounded-md border border-border-strong bg-surface-elevated p-3 text-body text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
        </ContextSurface>
      ))}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button variant="primary" isLoading={isSaving} onClick={save}>
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
