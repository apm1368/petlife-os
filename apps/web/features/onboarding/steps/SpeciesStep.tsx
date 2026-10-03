"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bird, Cat, Dog, Fish, PawPrint, Rabbit, Rat, Turtle } from "@petlife/ui";
import { SPECIES_LABELS } from "@/features/pets/pet-identity";
import { OnboardingChapter, OnboardingStatus, PetSpecies } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";

const SPECIES = [
  { value: PetSpecies.DOG, icon: Dog },
  { value: PetSpecies.CAT, icon: Cat },
  { value: PetSpecies.BIRD, icon: Bird },
  { value: PetSpecies.RABBIT, icon: Rabbit },
  { value: PetSpecies.RODENT, icon: Rat },
  { value: PetSpecies.FISH, icon: Fish },
  { value: PetSpecies.REPTILE, icon: Turtle },
  { value: PetSpecies.OTHER, icon: PawPrint },
];

export function SpeciesStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.species");
  const fa = useLocale() === "fa";
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
      <div className="add-pet-species">
        <div>
          {SPECIES.map(({ value, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={species === value} onClick={() => void choose(value)}>
              <Icon size={22} aria-hidden="true" />
              <span>{SPECIES_LABELS[value]![fa ? 0 : 1]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
