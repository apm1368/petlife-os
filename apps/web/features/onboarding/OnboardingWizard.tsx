"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
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

function OnboardingWizardInner() {
  const [step, setStep] = useState<Step | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const update = useOnboardingStore((s) => s.update);
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    let cancelled = false;

    async function resume() {
      const progress = await onboardingService.getProgress();
      if (cancelled) return;

      if (progress.status === "COMPLETED" && progress.chapter === "READY") {
        router.replace(sanitizeReturnTo(returnTo, `/${locale}/home`));
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

    void resume().catch(() => { if (!cancelled) setLoadError(true); });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function goTo(next: Step) {
    setStep(next);
  }

  if (loadError) return <ErrorRecovery title={locale === "fa" ? "اتصال به اطلاعات راه‌اندازی برقرار نشد" : "Could not load onboarding"} message="" retryLabel={locale === "fa" ? "تلاش دوباره" : "Retry"} onRetry={() => { setLoadError(false); setAttempt((value) => value + 1); }} />;
  if (!step) {
    return <Skeleton className="h-64 w-full" aria-label="Loading onboarding" />;
  }

  function renderStep() {
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
      return <ReadyStep returnTo={returnTo} />;
    default:
      return null;
  }
  }
  const current = STEP_ORDER.indexOf(step);
  const groups = locale === "fa" ? ["خانواده", "آشنایی با حیوان", "سلامت و مراقبت", "آماده‌اید"] : ["Household", "Meet your pet", "Health & care", "Ready"];
  const activeGroup = current === 0 ? 0 : current < 7 ? 1 : current < 13 ? 2 : 3;
  return <div className="onboarding-layout"><aside><p className="text-metadata text-text-secondary">{locale === "fa" ? "به خانواده پت‌لایف خوش آمدید" : "Welcome to the PET LIFE family"}</p><ol className="mt-6 space-y-4">{groups.map((label, index) => <li key={label} aria-current={index === activeGroup ? "step" : undefined} className="flex items-center gap-3 text-body"><span className="onboarding-step-number">{new Intl.NumberFormat(locale).format(index + 1)}</span>{label}</li>)}</ol><p className="mt-8 text-metadata text-text-secondary" role="status">{locale === "fa" ? "مرحله" : "Step"} {new Intl.NumberFormat(locale).format(current + 1)} / {new Intl.NumberFormat(locale).format(STEP_ORDER.length)}</p><progress className="mt-3 w-full accent-brand-natural" value={current + 1} max={STEP_ORDER.length} aria-label={locale === "fa" ? "پیشرفت راه‌اندازی" : "Onboarding progress"} /></aside><section className="min-w-0">{renderStep()}</section></div>;
}

export function OnboardingWizard() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" aria-label="Loading onboarding" />}>
      <OnboardingWizardInner />
    </Suspense>
  );
}
