"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";

export function BreedStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const t = useTranslations("onboarding.breed");
  const tCommon = useTranslations("common");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const breed = useOnboardingStore((s) => s.breed);
  const update = useOnboardingStore((s) => s.update);
  const [value, setValue] = useState(breed ?? "");

  async function finish(skip: boolean) {
    if (!skip && value.trim() && petId) {
      await petsService.update(petId, { breed: value.trim() });
      update({ breed: value.trim() });
    }
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PET_IDENTITY,
      step: "breed",
      status: skip ? OnboardingStatus.SKIPPED : OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
    (skip ? onSkip : onNext)();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <Input label={t("title")} value={value} onChange={(e) => setValue(e.target.value)} />
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
