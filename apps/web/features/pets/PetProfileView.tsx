"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetDto } from "@petlife/types";
import { PetLifecycleStatus } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";

export function PetProfileView({ petId }: { petId: string }) {
  const t = useTranslations("pets.profile");
  const tCommon = useTranslations("common");
  const activePetId = usePetStore((s) => s.activePetId);
  const upsertPet = usePetStore((s) => s.upsertPet);

  const [pet, setPet] = useState<PetDto | null>(null);
  const [error, setError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");

  async function load() {
    setError(false);
    try {
      const data = await petsService.getById(petId);
      setPet(data);
      setName(data.name);
      setBreed(data.breed ?? "");
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function saveIdentity() {
    const updated = await petsService.update(petId, { name, breed: breed || null });
    setPet(updated);
    upsertPet(updated);
    setIsEditing(false);
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!pet) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar src={pet.photoUrl} name={pet.name} size="lg" />
        <div>
          <h1 className="text-hero text-text-primary">{pet.name}</h1>
          <p className="text-body text-text-secondary">{pet.breed ?? pet.species}</p>
          <div className="mt-1 flex gap-2">
            {pet.id === activePetId ? <StatusLabel tone="success">Active</StatusLabel> : null}
            {pet.lifecycleStatus !== PetLifecycleStatus.ACTIVE ? (
              <StatusLabel tone="attention">{pet.lifecycleStatus}</StatusLabel>
            ) : null}
          </div>
        </div>
      </div>

      <ContextSurface className="grid grid-cols-2 gap-4">
        <Field label="Species" value={pet.species} />
        <Field label="Age" value={formatAge(pet)} />
        <Field label={t("weight")} value={pet.latestWeightValue ? `${pet.latestWeightValue} ${pet.latestWeightUnit}` : t("unknown")} />
        <Field label="Status" value={pet.lifecycleStatus} />
      </ContextSurface>

      <ContextSurface>
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                {tCommon("cancel")}
              </Button>
              <Button variant="primary" onClick={saveIdentity}>
                {tCommon("save")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            {t("editIdentity")}
          </Button>
        )}
      </ContextSurface>

      <ContextSurface className="flex items-center justify-between">
        <span className="text-body text-text-primary">{t("digitalId")}</span>
        <StatusLabel tone="neutral">{t("digitalIdComingSoon")}</StatusLabel>
      </ContextSurface>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-metadata text-text-secondary">{label}</p>
      <p className="text-body text-text-primary">{value}</p>
    </div>
  );
}

function formatAge(pet: PetDto): string {
  if (pet.birthDate) {
    const months = Math.max(0, Math.floor((Date.now() - new Date(pet.birthDate).getTime()) / (30 * 24 * 60 * 60 * 1000)));
    return `${Math.floor(months / 12)}y ${months % 12}m`;
  }
  if (pet.approximateAgeMonths !== null) {
    return `~${Math.floor(pet.approximateAgeMonths / 12)}y ${pet.approximateAgeMonths % 12}m`;
  }
  return "Unknown";
}
