"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { PetSpecies } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";
import { DateReading } from "@/lib/date/date-reading";

export function AddPetView() {
  const router = useRouter();
  const locale = useLocale();
  const fa = locale === "fa";
  const householdId = usePetStore((s) => s.householdId);
  const upsertPet = usePetStore((s) => s.upsertPet);
  const setActivePetId = usePetStore((s) => s.setActivePetId);
  const activePetId = usePetStore((s) => s.activePetId);

  const [species, setSpecies] = useState<PetSpecies>(PetSpecies.DOG);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!householdId || !name.trim() || !birthDate) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const pet = await petsService.create(householdId, { name: name.trim(), species, birthDate }, `add-pet-${householdId}-${name}-${Date.now()}`);
      upsertPet(pet);
      if (!activePetId) setActivePetId(pet.id);
      router.push(`/${locale}/pets/${pet.id}`);
    } catch {
      setError(fa ? "ثبت حیوان انجام نشد. دوباره تلاش کنید." : "We couldn't add this pet. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="add-pet">
      <header className="section-head"><div><h1>{fa ? "افزودن حیوان" : "Add a pet"}</h1><p>{fa ? "با نام و تاریخ تولد شروع کنید؛ بقیهٔ اطلاعات را بعداً هم می‌توانید کامل کنید." : "Start with a name and birth date — you can complete the rest later."}</p></div></header>
      <fieldset className="add-pet__species">
        <legend>{fa ? "نوع حیوان" : "Species"}</legend>
        <div>
          <Button variant={species === PetSpecies.DOG ? "primary" : "secondary"} aria-pressed={species === PetSpecies.DOG} onClick={() => setSpecies(PetSpecies.DOG)}>{fa ? "سگ" : "Dog"}</Button>
          <Button variant={species === PetSpecies.CAT ? "primary" : "secondary"} aria-pressed={species === PetSpecies.CAT} onClick={() => setSpecies(PetSpecies.CAT)}>{fa ? "گربه" : "Cat"}</Button>
        </div>
      </fieldset>
      <Input label={fa ? "نام" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <Input label={fa ? "تاریخ تولد" : "Birth date"} type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        <DateReading value={birthDate} />
      </div>
      {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
      <div><Button variant="primary" isLoading={isSubmitting} disabled={!name.trim() || !birthDate} onClick={submit}>{fa ? "ذخیره" : "Save"}</Button></div>
    </div>
  );
}
