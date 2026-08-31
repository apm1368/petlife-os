"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, PetIdentity } from "@petlife/ui";
import { PetLifecycleStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";

export function ReadyStep() {
  const t = useTranslations("onboarding.ready");
  const draft = useOnboardingStore((s) => s);
  const reset = useOnboardingStore((s) => s.reset);
  const router = useRouter();
  const locale = useLocale();
  const [isCompleting, setIsCompleting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void onboardingService.complete(`onboarding-complete-${draft.petId}`).finally(() => {
      if (!cancelled) setIsCompleting(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToHome() {
    reset();
    router.replace(`/${locale}/home`);
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-hero text-text-primary">{t("title", { name: draft.name })}</h1>
      <p className="text-body text-text-secondary">{t("subtitle")}</p>
      {draft.species ? (
        <PetIdentity
          pet={{
            name: draft.name,
            species: draft.species,
            breed: draft.breed,
            photoUrl: draft.photoUrl,
            lifecycleStatus: PetLifecycleStatus.ACTIVE,
          }}
          isActive
          size="lg"
        />
      ) : null}
      <Button variant="primary" isLoading={isCompleting} onClick={goToHome}>
        {t("cta")}
      </Button>
    </div>
  );
}
