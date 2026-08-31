"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, StatusLabel } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus, PetInterest } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";

const INTERESTS: { value: PetInterest; key: string }[] = [
  { value: PetInterest.HEALTH, key: "health" },
  { value: PetInterest.VET, key: "vet" },
  { value: PetInterest.DAILY_CARE, key: "dailyCare" },
  { value: PetInterest.SHOPPING, key: "shopping" },
  { value: PetInterest.TRAINING, key: "training" },
  { value: PetInterest.TRAVEL, key: "travel" },
  { value: PetInterest.INSURANCE, key: "insurance" },
  { value: PetInterest.ANIMAL_SUPPORT, key: "animalSupport" },
];

export function PersonalizationStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.personalization");
  const tCommon = useTranslations("common");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const interests = useOnboardingStore((s) => s.interests);
  const update = useOnboardingStore((s) => s.update);
  const [selected, setSelected] = useState<Set<PetInterest>>(new Set(interests));

  function toggle(value: PetInterest) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function finish(skip: boolean) {
    const chosen = skip ? [] : Array.from(selected);
    update({ interests: chosen });
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PERSONALIZATION,
      step: "personalization",
      status: skip ? OnboardingStatus.SKIPPED : OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
      interests: chosen,
    });
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("title")}>
        {INTERESTS.map((interest) => {
          const active = selected.has(interest.value);
          return (
            <button key={interest.value} type="button" onClick={() => toggle(interest.value)} aria-pressed={active}>
              <StatusLabel tone={active ? "success" : "neutral"}>{t(interest.key)}</StatusLabel>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => finish(true)}>
          {tCommon("skip")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => finish(false)}>
          {tCommon("continue")}
        </Button>
      </div>
    </div>
  );
}
