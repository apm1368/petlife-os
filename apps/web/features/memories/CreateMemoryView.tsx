"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { PetMemoryType, PetMemoryVisibility } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { ApiError } from "@/lib/api/client";

const MEMORY_TYPES: PetMemoryType[] = [
  PetMemoryType.PHOTO,
  PetMemoryType.VIDEO,
  PetMemoryType.MILESTONE,
  PetMemoryType.STORY,
  PetMemoryType.BIRTHDAY,
  PetMemoryType.FIRST_DAY,
  PetMemoryType.ADOPTION_DAY,
  PetMemoryType.TRAVEL,
  PetMemoryType.ACHIEVEMENT,
  PetMemoryType.OTHER,
];

export function CreateMemoryView({ petId }: { petId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<PetMemoryType>(PetMemoryType.PHOTO);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!title.trim() || !occurredAt) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const mediaObjectKeys: string[] = [];
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const target = await memoriesService.requestMediaUpload(petId, file.type, file.size, PetMemoryVisibility.PRIVATE);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        mediaObjectKeys.push(target.key);
      }
      const memory = await memoriesService.create(petId, {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        occurredAt,
        location: location.trim() || undefined,
        mediaObjectKeys: mediaObjectKeys.length > 0 ? mediaObjectKeys : undefined,
      });
      router.push(`/pets/${petId}/memories/${memory.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("newMemory.title")}</h1>

      <ContextSurface className="flex flex-col gap-4">
        <Select label={t("newMemory.typeLabel")} value={type} onChange={(e) => setType(e.target.value as PetMemoryType)} options={MEMORY_TYPES.map((value) => ({ value, label: t(`memoryType.${value}`) }))} />
        <Input label={t("newMemory.titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label={t("newMemory.descriptionLabel")} hint={tCommon("optional")} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label={t("newMemory.occurredAtLabel")} type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        <Input label={t("newMemory.locationLabel")} hint={tCommon("optional")} value={location} onChange={(e) => setLocation(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("newMemory.mediaLabel")}</span>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
        </div>
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit} disabled={!title.trim() || !occurredAt}>
          {t("newMemory.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}
