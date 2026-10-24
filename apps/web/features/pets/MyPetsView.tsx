"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, PetIdentity } from "@petlife/ui";
import { useActivePet } from "@/hooks/use-active-pet";
import { petIdentityLabels } from "./pet-identity";
import styles from "./MyPetsView.module.css";

export function MyPetsView() {
  const t = useTranslations("pets");
  const router = useRouter();
  const locale = useLocale();
  const { pets, activePetId, switchActivePet, isSwitching } = useActivePet();
  const [switchFailed, setSwitchFailed] = useState(false);

  async function selectPet(id: string) {
    if (isSwitching) return;
    setSwitchFailed(false);
    try {
      await switchActivePet(id);
    } catch {
      setSwitchFailed(true);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="text-page-title text-text-primary">{t("myPets")}</h1>
          <p className="text-text-secondary">{t("listDescription")}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => router.push(`/${locale}/pets/new`)}>
          {t("addPet")}
        </Button>
      </header>
      {switchFailed ? <p role="alert" className={styles.error}>{t("switchFailed")}</p> : null}
      {pets.length === 0 ? (
        <ContextSurface className={styles.empty}>
          <h2 className="text-section-title">{t("emptyTitle")}</h2>
          <p className="text-text-secondary">{t("emptyDescription")}</p>
        </ContextSurface>
      ) : (
        <ul className={styles.grid} aria-label={t("myPets")}>
          {pets.map((pet) => (
            <li key={pet.id}>
              <ContextSurface className={styles.card}>
                <PetIdentity size="lg" className={styles.identity} pet={pet} isActive={pet.id === activePetId} labels={petIdentityLabels(pet, locale === "en" ? "en" : "fa")} />
                <div className={styles.actions}>
                  {pet.id !== activePetId ? (
                    <Button variant="secondary" size="sm" disabled={isSwitching} onClick={() => void selectPet(pet.id)}>
                      {t("setActive")}
                    </Button>
                  ) : null}
                  <Button variant="primary" size="sm" onClick={() => router.push(`/${locale}/pets/${pet.id}`)}>
                    {t("openProfile")}
                  </Button>
                </div>
              </ContextSurface>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
