"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePetStore } from "@/stores/pet-store";
import { PetCareCalendarView } from "./PetCareCalendarView";
export function CareCalendarView() {
  const locale = useLocale();
  const t = useTranslations("careCalendar");
  const pets = usePetStore((state) => state.pets);
  const active = usePetStore((state) => state.activePetId);
  const [selected, setSelected] = useState<string | null>(null);
  const petId = selected ?? active ?? pets[0]?.id;

  const picker = pets.length > 1 ? (
    <label className="calendar-toolbar__pet">
      <span>{t("petLabel")}</span>
      <select value={petId ?? ""} onChange={(event) => setSelected(event.target.value)}>
        {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
      </select>
    </label>
  ) : null;

  return petId
    ? <PetCareCalendarView key={petId} petId={petId} toolbar={picker} />
    : <Link href={`/${locale}/pets`}>{t("choosePet")}</Link>;
}
