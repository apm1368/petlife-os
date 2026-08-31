"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Skeleton, StatusLabel } from "@petlife/ui";
import type { CareProfileDto } from "@petlife/types";
import { careProfileService, type UpdateCareProfileInput } from "@/services/care-profile.service";
import { petsService } from "@/services/pets.service";
import { CareProfileForm } from "./CareProfileForm";

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

/**
 * A user with canViewCareProfile but not canEditCareProfile gets read-only
 * UI — never the edit form, never a save action that would 403.
 */
export function CareProfileView({ petId }: { petId: string }) {
  const t = useTranslations("care.profile");
  const tCommon = useTranslations("common");
  const [profile, setProfile] = useState<CareProfileDto | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  async function load() {
    const [data, access] = await Promise.all([careProfileService.get(petId), petsService.getMyAccess(petId)]);
    setProfile(data);
    setCanEdit(access.canEditCareProfile);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (!profile) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  if (isEditing) {
    return (
      <CareProfileForm
        petId={petId}
        profile={profile}
        onSaved={(updated) => {
          setProfile(updated);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  const hasAnyText = FIELDS.some((field) => profile[field.key]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {canEdit ? (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            {t("edit")}
          </Button>
        ) : (
          <StatusLabel tone="neutral">{tCommon("optional")}</StatusLabel>
        )}
      </div>

      {!canEdit ? <p className="text-metadata text-text-secondary">{t("readOnlyNotice")}</p> : null}

      {!hasAnyText ? (
        <ContextSurface>
          <p className="text-body text-text-secondary">{t("empty")}</p>
        </ContextSurface>
      ) : (
        FIELDS.filter((field) => profile[field.key]).map((field) => (
          <ContextSurface key={field.key}>
            <h2 className="text-section-title text-text-primary">{t(field.labelKey)}</h2>
            <p className="mt-1 text-body text-text-secondary">{profile[field.key] as string}</p>
          </ContextSurface>
        ))
      )}
    </div>
  );
}
