"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PetMemoryDto } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { ApiError } from "@/lib/api/client";

export function MemoryDetailView({ petId, memoryId }: { petId: string; memoryId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [memory, setMemory] = useState<PetMemoryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    setError(null);
    try {
      setMemory(await memoriesService.get(petId, memoryId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, memoryId]);

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);
    setError(null);
    try {
      await memoriesService.delete(petId, memoryId);
      router.push(`/pets/${petId}/memories`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsDeleting(false);
    }
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!memory) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{memory.title}</h1>

      <ContextSurface className="flex flex-col gap-3">
        {memory.mediaUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {memory.mediaUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={memory.title} className="h-48 w-full rounded-md object-cover" />
            ))}
          </div>
        ) : null}
        <p className="text-metadata text-text-secondary">{new Date(memory.occurredAt).toLocaleDateString()}</p>
        {memory.location ? <p className="text-metadata text-text-secondary">{memory.location}</p> : null}
        {memory.description ? <p className="text-body text-text-primary">{memory.description}</p> : null}
        <div>
          <Button variant="ghost" isLoading={isDeleting} onClick={handleDelete}>
            {t("detail.delete")}
          </Button>
        </div>
      </ContextSurface>
    </div>
  );
}
