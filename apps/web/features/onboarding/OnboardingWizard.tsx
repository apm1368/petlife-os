"use client";

import { consumeLandingIntent } from "@/features/landing/intent";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { HouseholdStep } from "./steps/HouseholdStep";
import { SpeciesStep } from "./steps/SpeciesStep";
import { PetNameStep } from "./steps/PetNameStep";
import { AgeStep } from "./steps/AgeStep";
import { PetPhotoStep } from "./steps/PetPhotoStep";
import { BreedStep } from "./steps/BreedStep";
import { SexStep } from "./steps/SexStep";
import { PersonalizationStep } from "./steps/PersonalizationStep";
import { ReadyStep } from "./steps/ReadyStep";
import { KnowledgeAreaStep } from "./steps/health/KnowledgeAreaStep";
import { VaccinationBasicsStep } from "./steps/health/VaccinationBasicsStep";
import { DietBasicsStep } from "./steps/health/DietBasicsStep";

const STEP_ORDER = [
  "household",
  "species",
  "pet-name",
  "age",
  "pet-photo",
  "breed",
  "sex",
  "health-allergies",
  "health-conditions",
  "health-medications",
  "health-vaccination",
  "health-diet",
  "personalization",
  "ready",
] as const;
type Step = (typeof STEP_ORDER)[number];

export function OnboardingWizard() {
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const update = useOnboardingStore((s) => s.update);
  const router = useRouter();
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  useEffect(() => {
    let cancelled = false;

    async function resume() {
      const progress = await onboardingService.getProgress();
      if (cancelled) return;

      if (progress.status === "COMPLETED" && progress.chapter === "READY") {
        router.replace(consumeLandingIntent(locale) ?? `/${locale}/home`);
        return;
      }

      if (progress.householdId) update({ householdId: progress.householdId });
      if (progress.petId) {
        const pet = await petsService.getById(progress.petId);
        if (cancelled) return;
        update({
          petId: pet.id,
          species: pet.species,
          name: pet.name,
          breed: pet.breed,
          sex: pet.sex,
          photoUrl: pet.photoUrl,
          birthDate: pet.birthDate,
          approximateAgeMonths: pet.approximateAgeMonths,
        });
      }

      const resumeStep = STEP_ORDER.includes(progress.step as Step) ? (progress.step as Step) : "household";
      // Resume at the step AFTER the last completed one, unless it was skipped mid-way.
      const index = STEP_ORDER.indexOf(resumeStep);
      const next = progress.status === "IN_PROGRESS" ? resumeStep : (STEP_ORDER[index + 1] ?? "ready");
      setStep(next);
    }

    void resume().catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  function goTo(next: Step) {
    setStep(next);
  }

  if (error) {
    return (
      <ErrorRecovery
        title={tErrors("generic")}
        message=""
        retryLabel={tCommon("retry")}
        onRetry={() => {
          setError(false);
          setRetryCount((count) => count + 1);
        }}
      />
    );
  }

  if (!step) {
    return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;
  }

  switch (step) {
    case "household":
      return <HouseholdStep onNext={() => goTo("species")} />;
    case "species":
      return <SpeciesStep onNext={() => goTo("pet-name")} />;
    case "pet-name":
      return <PetNameStep onNext={() => goTo("age")} />;
    case "age":
      return <AgeStep onNext={() => goTo("pet-photo")} />;
    case "pet-photo":
      return <PetPhotoStep onNext={() => goTo("breed")} onSkip={() => goTo("breed")} />;
    case "breed":
      return <BreedStep onNext={() => goTo("sex")} onSkip={() => goTo("sex")} />;
    case "sex":
      return <SexStep onNext={() => goTo("health-allergies")} onSkip={() => goTo("health-allergies")} />;
    case "health-allergies":
      return (
        <KnowledgeAreaStep
          domain="allergies"
          titleKey="allergies.title"
          namePlaceholderKey="allergies.namePlaceholder"
          onNext={() => goTo("health-conditions")}
        />
      );
    case "health-conditions":
      return (
        <KnowledgeAreaStep
          domain="conditions"
          titleKey="conditions.title"
          namePlaceholderKey="conditions.namePlaceholder"
          onNext={() => goTo("health-medications")}
        />
      );
    case "health-medications":
      return (
        <KnowledgeAreaStep
          domain="medications"
          titleKey="medications.title"
          namePlaceholderKey="medications.namePlaceholder"
          onNext={() => goTo("health-vaccination")}
        />
      );
    case "health-vaccination":
      return <VaccinationBasicsStep onNext={() => goTo("health-diet")} />;
    case "health-diet":
      return <DietBasicsStep onNext={() => goTo("personalization")} />;
    case "personalization":
      return <PersonalizationStep onNext={() => goTo("ready")} />;
    case "ready":
      return <ReadyStep />;
    default:
      return null;
  }
}
