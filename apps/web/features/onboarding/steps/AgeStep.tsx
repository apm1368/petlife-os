"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { BirthDateField } from "@/features/shared/date-picker/BirthDateField";
import { petsService } from "@/services/pets.service";

export function AgeStep({ onNext }: { onNext: (petId: string) => void }) {
  const t = useTranslations("onboarding.age");
  const tCommon = useTranslations("common");
  const draft = useOnboardingStore((s) => s);
  const update = useOnboardingStore((s) => s.update);

  const [useApprox, setUseApprox] = useState(draft.approximateAgeMonths != null && !draft.birthDate);
  const [birthDate, setBirthDate] = useState(draft.birthDate ?? "");
  const [approxMonths, setApproxMonths] = useState(draft.approximateAgeMonths?.toString() ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedMonths = Number(approxMonths.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  const validApprox = approxMonths.trim() !== "" && Number.isInteger(parsedMonths) && parsedMonths >= 0 && parsedMonths <= 600;
  const canContinue = useApprox ? validApprox : !!birthDate;

  async function handleContinue(skip = false) {
    if (isSubmitting || (!skip && !canContinue)) return;
    if (!draft.householdId || !draft.species || !draft.name) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const age = !skip ? useApprox ? { approximateAgeMonths: parsedMonths } : { birthDate } : {};
      const pet = draft.petId
        ? skip ? await petsService.getById(draft.petId) : await petsService.update(draft.petId, { ...age, ...(useApprox ? { birthDate: null } : { approximateAgeMonths: null }) })
        : await petsService.create(
          draft.householdId,
          { name: draft.name, species: draft.species, ...age },
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
      setError(t("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <p className="text-text-secondary">{t("optional")}</p>
      <Button variant="secondary" disabled={isSubmitting} onClick={() => void handleContinue(true)}>{t("skip")}</Button>
      {!useApprox ? (
        <BirthDateField label={t("birthDateLabel")} value={birthDate} onChange={setBirthDate} />
      ) : (
        <Input
          label={t("approxAgeLabel")}
          inputMode="numeric"
          value={approxMonths}
          onChange={(e) => setApproxMonths(e.target.value)}
        />
      )}
      <button
        type="button"
        className="w-fit text-metadata text-brand-mint underline"
        disabled={isSubmitting}
        onClick={() => setUseApprox((v) => !v)}
      >
        {t(useApprox ? "useExact" : "useApprox")}
      </button>
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <Button variant="primary" isLoading={isSubmitting} disabled={!canContinue || isSubmitting} onClick={() => void handleContinue()}>
        {tCommon("continue")}
      </Button>
    </div>
  );
}
