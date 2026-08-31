"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { householdsService } from "@/services/households.service";
import { onboardingService } from "@/services/onboarding.service";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";

export function HouseholdStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.household");
  const tCommon = useTranslations("common");
  const update = useOnboardingStore((s) => s.update);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setIsSubmitting(true);
    setError(null);
    try {
      const household = await householdsService.create({ name: name || undefined, city: city || undefined });
      update({ householdId: household.id });
      await onboardingService.updateProgress({
        chapter: OnboardingChapter.HOUSEHOLD,
        step: "household",
        status: OnboardingStatus.COMPLETED,
        householdId: household.id,
      });
      onNext();
    } catch {
      setError("Something went wrong creating your household. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      <Input label={`${t("nameLabel")} (${tCommon("optional")})`} value={name} onChange={(e) => setName(e.target.value)} />
      <Input label={`${t("cityLabel")} (${tCommon("optional")})`} value={city} onChange={(e) => setCity(e.target.value)} />
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <Button variant="primary" isLoading={isSubmitting} onClick={handleContinue}>
        {tCommon("continue")}
      </Button>
    </div>
  );
}
