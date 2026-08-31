"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, PetIdentity } from "@petlife/ui";
import { useActivePet } from "@/hooks/use-active-pet";

export function MyPetsView() {
  const t = useTranslations("pets");
  const router = useRouter();
  const locale = useLocale();
  const { pets, activePetId, switchActivePet } = useActivePet();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("myPets")}</h1>
        <Button variant="primary" size="sm" onClick={() => router.push(`/${locale}/pets/new`)}>
          {t("addPet")}
        </Button>
      </div>

      {pets.map((pet) => (
        <ContextSurface key={pet.id} className="flex items-center justify-between gap-4">
          <PetIdentity pet={pet} isActive={pet.id === activePetId} />
          <div className="flex flex-col gap-2">
            {pet.id !== activePetId ? (
              <Button variant="secondary" size="sm" onClick={() => void switchActivePet(pet.id)}>
                {t("setActive")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/pets/${pet.id}`)}>
              {t("openProfile")}
            </Button>
          </div>
        </ContextSurface>
      ))}
    </div>
  );
}
