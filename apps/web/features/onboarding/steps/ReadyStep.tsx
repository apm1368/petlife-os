"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, PetIdentity } from "@petlife/ui";
import { PetLifecycleStatus } from "@petlife/types";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingService } from "@/services/onboarding.service";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { petIdentityLabels } from "@/features/pets/pet-identity";
import { reloadHouseholdPets } from "@/hooks/use-app-bootstrap";

export function ReadyStep({ returnTo }: { returnTo?: string | null }) {
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

  const [isLeaving, setIsLeaving] = useState(false);

  async function goToHome() {
    setIsLeaving(true);
    // The member area's pet store was filled before this pet existed; refresh it so Home shows the new pet at once.
    await reloadHouseholdPets().catch(() => undefined);
    reset();
    router.replace(sanitizeReturnTo(returnTo, `/${locale}/home`));
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
          labels={petIdentityLabels({ species: draft.species, lifecycleStatus: PetLifecycleStatus.ACTIVE }, locale as "fa" | "en" | "de" | "es")}
        />
      ) : null}
      <Button variant="primary" isLoading={isCompleting || isLeaving} onClick={() => void goToHome()}>
        {t("cta")}
      </Button>
    </div>
  );
}
