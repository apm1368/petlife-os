"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { DietType, OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { nutritionService } from "@/services/nutrition.service";
import { onboardingService } from "@/services/onboarding.service";
import { useOnboardingStore } from "@/stores/onboarding-store";

const CHOICES: { value: DietType; key: string }[] = [
  { value: DietType.DRY, key: "dry" },
  { value: DietType.WET, key: "wet" },
  { value: DietType.MIXED, key: "mixed" },
];

export function DietBasicsStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.healthBasics");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function markStep(status: OnboardingStatus) {
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.HEALTH_BASICS,
      step: "diet",
      status,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
  }

  async function choose(dietType: DietType) {
    if (!petId) return;
    setIsSubmitting(true);
    try {
      await nutritionService.upsert(petId, { dietType });
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

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("diet.title")}</h1>
      <div className="flex flex-col gap-2">
        {CHOICES.map((choice) => (
          <Button key={choice.value} variant="secondary" isLoading={isSubmitting} onClick={() => choose(choice.value)}>
            {t(`diet.${choice.key}`)}
          </Button>
        ))}
        <Button variant="secondary" isLoading={isSubmitting} onClick={() => choose(DietType.UNKNOWN)}>
          {t("dontKnow")}
        </Button>
      </div>
      <Button variant="ghost" onClick={skip}>
        {t("addLater")}
      </Button>
    </div>
  );
}
