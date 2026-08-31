"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus, PetSex } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";

export function SexStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const t = useTranslations("onboarding.sex");
  const tCommon = useTranslations("common");
  const petId = useOnboardingStore((s) => s.petId);
  const householdId = useOnboardingStore((s) => s.householdId);
  const sex = useOnboardingStore((s) => s.sex);
  const update = useOnboardingStore((s) => s.update);
  const [selected, setSelected] = useState<PetSex | null>(sex);

  async function finish(skip: boolean) {
    if (!skip && selected && petId) {
      await petsService.update(petId, { sex: selected });
      update({ sex: selected });
    }
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PET_IDENTITY,
      step: "sex",
      status: skip ? OnboardingStatus.SKIPPED : OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
      petId: petId ?? undefined,
    });
    (skip ? onSkip : onNext)();
  }

  const options: { value: PetSex; label: string }[] = [
    { value: PetSex.MALE, label: t("male") },
    { value: PetSex.FEMALE, label: t("female") },
    { value: PetSex.UNKNOWN, label: t("unknown") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <div className="flex gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selected === option.value ? "primary" : "secondary"}
            className="flex-1"
            onClick={() => setSelected(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => finish(true)}>
          {tCommon("skip")}
        </Button>
        <Button variant="primary" className="flex-1" disabled={!selected} onClick={() => finish(false)}>
          {tCommon("continue")}
        </Button>
      </div>
    </div>
  );
}
