"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { HealthAreaKnowledgeState, OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { healthService, type UpdateHealthProfileInput } from "@/services/health.service";
import { onboardingService } from "@/services/onboarding.service";
import { useOnboardingStore } from "@/stores/onboarding-store";

export type KnowledgeAreaDomain = "allergies" | "conditions" | "medications";

/**
 * Shared shape for the three Health Basics questions that are backed by a
 * list (allergies/conditions/medications): "No known X" / "Yes" (captures a
 * single lightweight entry inline, never a full intake form) / "I don't
 * know" / skip ("Add later"). Selecting "No known"/"I don't know" writes the
 * pet-level overall state; skipping leaves it Incomplete — never the same
 * stored state as an explicit answer.
 */
export function KnowledgeAreaStep({
  domain,
  titleKey,
  namePlaceholderKey,
  onNext,
}: {
  domain: KnowledgeAreaDomain;
  titleKey: string;
  namePlaceholderKey: string;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.healthBasics");
  const tCommon = useTranslations("common");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryName, setEntryName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function markStep(status: OnboardingStatus) {
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.HEALTH_BASICS,
      step: domain,
      status,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
  }

  function overallStatePatch(state: HealthAreaKnowledgeState): UpdateHealthProfileInput {
    switch (domain) {
      case "allergies":
        return { allergiesOverallState: state };
      case "conditions":
        return { conditionsOverallState: state };
      case "medications":
        return { medicationsOverallState: state };
    }
  }

  async function chooseNoneKnown() {
    if (!petId) return;
    setIsSubmitting(true);
    try {
      await healthService.updateProfile(petId, overallStatePatch(HealthAreaKnowledgeState.NONE_KNOWN));
      await markStep(OnboardingStatus.COMPLETED);
      onNext();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function chooseUnknown() {
    if (!petId) return;
    setIsSubmitting(true);
    try {
      await healthService.updateProfile(petId, overallStatePatch(HealthAreaKnowledgeState.UNKNOWN));
      await markStep(OnboardingStatus.COMPLETED);
      onNext();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitEntry() {
    if (!petId || !entryName.trim()) return;
    setIsSubmitting(true);
    try {
      if (domain === "allergies") await healthService.createAllergy(petId, { name: entryName.trim() });
      else if (domain === "conditions") await healthService.createCondition(petId, { name: entryName.trim() });
      else await healthService.createMedication(petId, { name: entryName.trim() });
      await markStep(OnboardingStatus.COMPLETED);
      onNext();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function skip() {
    await markStep(OnboardingStatus.SKIPPED);
    onNext();
  }

  if (showAddEntry) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t(titleKey)}</h1>
        <Input label={t(namePlaceholderKey)} value={entryName} onChange={(e) => setEntryName(e.target.value)} autoFocus />
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setShowAddEntry(false)}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" isLoading={isSubmitting} disabled={!entryName.trim()} onClick={submitEntry}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t(titleKey)}</h1>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" isLoading={isSubmitting} onClick={chooseNoneKnown}>
          {t(`${domain}.noneKnown`)}
        </Button>
        <Button variant="secondary" onClick={() => setShowAddEntry(true)}>
          {t("yes")}
        </Button>
        <Button variant="secondary" isLoading={isSubmitting} onClick={chooseUnknown}>
          {t("dontKnow")}
        </Button>
      </div>
      <Button variant="ghost" onClick={skip}>
        {t("addLater")}
      </Button>
    </div>
  );
}
