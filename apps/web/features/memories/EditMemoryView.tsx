"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import type { PetMemoryDto } from "@petlife/types";
import { PetMemoryType } from "@petlife/types";
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

export function EditMemoryView({ petId, memoryId }: { petId: string; memoryId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [memory, setMemory] = useState<PetMemoryDto | null>(null);
  const [type, setType] = useState<PetMemoryType>(PetMemoryType.PHOTO);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [location, setLocation] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const loaded = await memoriesService.get(petId, memoryId);
      setMemory(loaded);
      setType(loaded.type);
      setTitle(loaded.title ?? "");
      setDescription(loaded.description ?? "");
      setOccurredAt(loaded.occurredAt.slice(0, 10));
      setLocation(loaded.location ?? "");
      setTagsInput(loaded.tags.join(", "));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, memoryId]);

  async function handleSubmit(): Promise<void> {
    if (!occurredAt) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await memoriesService.update(petId, memoryId, {
        type,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        occurredAt,
        location: location.trim() || undefined,
        tags: parseTags(tagsInput),
      });
      router.push(`/pets/${petId}/memories/${memoryId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsSubmitting(false);
    }
  }

  if (error && !memory) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!memory) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("editMemory.title")}</h1>

      <ContextSurface className="flex flex-col gap-4">
        <Select label={t("newMemory.typeLabel")} value={type} onChange={(e) => setType(e.target.value as PetMemoryType)} options={MEMORY_TYPES.map((value) => ({ value, label: t(`memoryType.${value}`) }))} />
        <Input label={t("newMemory.titleLabel")} hint={tCommon("optional")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label={t("newMemory.descriptionLabel")} hint={tCommon("optional")} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label={t("newMemory.occurredAtLabel")} type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        <Input label={t("newMemory.locationLabel")} hint={tCommon("optional")} value={location} onChange={(e) => setLocation(e.target.value)} />
        <Input label={t("newMemory.tagsLabel")} hint={t("newMemory.tagsHint")} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit} disabled={!occurredAt}>
            {t("editMemory.submit")}
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/pets/${petId}/memories/${memoryId}`)}>
            {tCommon("cancel")}
          </Button>
        </div>
      </ContextSurface>
    </div>
  );
}

/** Comma-separated free text → a clean, de-duplicated tag array. */
export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );
}
