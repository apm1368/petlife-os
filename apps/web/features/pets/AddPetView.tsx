"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button, Input } from "@petlife/ui";
import { PetSpecies } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";

export function AddPetView() {
  const router = useRouter();
  const locale = useLocale();
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
      setError("Something went wrong creating this pet. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">Add pet</h1>
      <div className="flex gap-2">
        <Button variant={species === PetSpecies.DOG ? "primary" : "secondary"} className="flex-1" onClick={() => setSpecies(PetSpecies.DOG)}>
          Dog
        </Button>
        <Button variant={species === PetSpecies.CAT ? "primary" : "secondary"} className="flex-1" onClick={() => setSpecies(PetSpecies.CAT)}>
          Cat
        </Button>
      </div>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Birthday" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <Button variant="primary" isLoading={isSubmitting} disabled={!name.trim() || !birthDate} onClick={submit}>
        Save
      </Button>
    </div>
  );
}
