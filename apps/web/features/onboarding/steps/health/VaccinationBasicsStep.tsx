"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus, VaccinationStatus } from "@petlife/types";
import { healthService } from "@/services/health.service";
import { onboardingService } from "@/services/onboarding.service";
import { useOnboardingStore } from "@/stores/onboarding-store";

const CHOICES: { value: VaccinationStatus; key: string }[] = [
  { value: VaccinationStatus.UP_TO_DATE, key: "upToDate" },
  { value: VaccinationStatus.DUE_SOON, key: "dueSoon" },
  { value: VaccinationStatus.OVERDUE, key: "overdue" },
];

export function VaccinationBasicsStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.healthBasics");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function markStep(status: OnboardingStatus) {
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.HEALTH_BASICS,
      step: "vaccination",
      status,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
  }

  async function choose(status: VaccinationStatus) {
    if (!petId) return;
    setIsSubmitting(true);
    try {
      await healthService.updateVaccinationSummary(petId, { status });
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
      <h1 className="text-page-title text-text-primary">{t("vaccination.title")}</h1>
      <div className="flex flex-col gap-2">
        {CHOICES.map((choice) => (
          <Button key={choice.value} variant="secondary" isLoading={isSubmitting} onClick={() => choose(choice.value)}>
            {t(`vaccination.${choice.key}`)}
          </Button>
        ))}
        <Button variant="secondary" isLoading={isSubmitting} onClick={() => choose(VaccinationStatus.UNKNOWN)}>
          {t("dontKnow")}
        </Button>
      </div>
      <Button variant="ghost" onClick={skip}>
        {t("addLater")}
      </Button>
    </div>
  );
}
