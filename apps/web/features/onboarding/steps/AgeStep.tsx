"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";

export function AgeStep({ onNext }: { onNext: (petId: string) => void }) {
  const t = useTranslations("onboarding.age");
  const tCommon = useTranslations("common");
  const draft = useOnboardingStore((s) => s);
  const update = useOnboardingStore((s) => s.update);

  const [useApprox, setUseApprox] = useState(false);
  const [birthDate, setBirthDate] = useState(draft.birthDate ?? "");
  const [approxMonths, setApproxMonths] = useState(draft.approximateAgeMonths?.toString() ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useApprox ? approxMonths.trim().length > 0 : birthDate.trim().length > 0;

  async function handleContinue() {
    if (!draft.householdId || !draft.species || !draft.name) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const pet = await petsService.create(
        draft.householdId,
        {
          name: draft.name,
          species: draft.species,
          birthDate: useApprox ? undefined : birthDate,
          approximateAgeMonths: useApprox ? Number(approxMonths) : undefined,
        },
        `onboarding-pet-${draft.householdId}-${draft.name}`,
      );
      update({ petId: pet.id, birthDate: pet.birthDate, approximateAgeMonths: pet.approximateAgeMonths });
      await onboardingService.updateProgress({
        chapter: OnboardingChapter.PET_IDENTITY,
        step: "age",
        status: OnboardingStatus.COMPLETED,
        householdId: draft.householdId,
        petId: pet.id,
      });
      onNext(pet.id);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {!useApprox ? (
        <Input label={t("birthDateLabel")} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      ) : (
        <Input
          label={t("approxAgeLabel")}
          type="number"
          min={0}
          value={approxMonths}
          onChange={(e) => setApproxMonths(e.target.value)}
        />
      )}
      <button
        type="button"
        className="w-fit text-metadata text-brand-mint underline"
        onClick={() => setUseApprox((v) => !v)}
      >
        {t("useApprox")}
      </button>
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <Button variant="primary" isLoading={isSubmitting} disabled={!canContinue} onClick={handleContinue}>
        {tCommon("continue")}
      </Button>
    </div>
  );
}
