"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PetDto, PetMemoryDto } from "@petlife/types";
import { PetLifecycleStatus } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";

/**
 * spec: Memorial mode must "suppress commercial/operational nudges" and
 * carry a respectful tone — this page never shows any commerce/booking
 * upsell, and its heading adapts once the pet's lifecycleStatus reads
 * DECEASED/MEMORIAL, matching the same status the backend already uses to
 * short-circuit Home ranking to a memories-only surface.
 */
export function MemoriesListView({ petId }: { petId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");

  const [pet, setPet] = useState<PetDto | null>(null);
  const [memories, setMemories] = useState<PetMemoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [petData, memoriesData] = await Promise.all([petsService.getById(petId), memoriesService.list(petId)]);
      setPet(petData);
      setMemories(memoriesData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!pet || !memories) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isMemorial = pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-text-primary">{isMemorial ? t("list.memorialTitle", { name: pet.name }) : t("list.title", { name: pet.name })}</h1>
          {isMemorial ? <p className="text-body text-text-secondary">{t("list.memorialSubtitle")}</p> : null}
        </div>
        <Link href={`/pets/${petId}/memories/new`}>
          <Button variant="primary">{t("list.addMemory")}</Button>
        </Link>
      </div>

      {memories.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((memory) => (
            <Link key={memory.id} href={`/pets/${petId}/memories/${memory.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                {memory.mediaUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={memory.mediaUrls[0]} alt={memory.title} className="h-32 w-full rounded-md object-cover" />
                ) : null}
                <span className="text-body text-text-primary">{memory.title}</span>
                <p className="text-metadata text-text-secondary">{new Date(memory.occurredAt).toLocaleDateString()}</p>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}

      <Link href={`/pets/${petId}/life-timeline`} className="text-body text-brand-mint underline">
        {t("list.viewLifeTimeline")}
      </Link>
    </div>
  );
}
