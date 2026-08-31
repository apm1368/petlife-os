"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";

export function PetNameStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("onboarding.petName");
  const tCommon = useTranslations("common");
  const name = useOnboardingStore((s) => s.name);
  const householdId = useOnboardingStore((s) => s.householdId);
  const update = useOnboardingStore((s) => s.update);
  const [value, setValue] = useState(name);

  async function handleContinue() {
    update({ name: value.trim() });
    await onboardingService.updateProgress({
      chapter: OnboardingChapter.PET_IDENTITY,
      step: "pet-name",
      status: OnboardingStatus.COMPLETED,
      householdId: householdId ?? undefined,
    });
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <Input label={t("title")} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <Button variant="primary" disabled={value.trim().length === 0} onClick={handleContinue}>
        {tCommon("continue")}
      </Button>
    </div>
  );
}
