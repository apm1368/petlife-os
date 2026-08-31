"use client";

import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus, PetSpecies } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";

export function SpeciesStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.species");
  const species = useOnboardingStore((s) => s.species);
  const householdId = useOnboardingStore((s) => s.householdId);
  const update = useOnboardingStore((s) => s.update);

  async function choose(value: PetSpecies) {
    update({ species: value });
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PET_IDENTITY,
      step: "species",
      status: OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
    });
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <div className="flex gap-3">
        <Button
          variant={species === PetSpecies.DOG ? "primary" : "secondary"}
          className="flex-1"
          onClick={() => choose(PetSpecies.DOG)}
        >
          {t("dog")}
        </Button>
        <Button
          variant={species === PetSpecies.CAT ? "primary" : "secondary"}
          className="flex-1"
          onClick={() => choose(PetSpecies.CAT)}
        >
          {t("cat")}
        </Button>
      </div>
    </div>
  );
}
