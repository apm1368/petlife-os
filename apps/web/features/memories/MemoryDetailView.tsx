"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [privateMediaUrls, setPrivateMediaUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    setError(null);
    try {
      const loaded = await memoriesService.get(petId, memoryId);
      setMemory(loaded);
      // A PRIVATE memory's DTO never carries a plain mediaUrls entry (see
      // memory-mapper.ts) — each item needs its own signed download.
      if (loaded.visibility === "PRIVATE" && loaded.mediaObjectKeys.length > 0) {
        const targets = await Promise.all(loaded.mediaObjectKeys.map((_, index) => memoriesService.getMediaDownload(petId, memoryId, index)));
        setPrivateMediaUrls(targets.map((target) => target.downloadUrl));
      } else {
        setPrivateMediaUrls([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, memoryId]);

  /** Archives (soft-deletes) — the memory and its media are preserved and can be restored from the archive view. */
  async function handleArchive(): Promise<void> {
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

  async function handleRestore(): Promise<void> {
    setIsDeleting(true);
    setError(null);
    try {
      await memoriesService.restore(petId, memoryId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsDeleting(false);
    }
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!memory) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const displayTitle = memory.title ?? new Date(memory.occurredAt).toLocaleDateString();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{displayTitle}</h1>

      <ContextSurface className="flex flex-col gap-3">
        {(memory.visibility === "PRIVATE" ? privateMediaUrls : memory.mediaUrls).length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {(memory.visibility === "PRIVATE" ? privateMediaUrls : memory.mediaUrls).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={displayTitle} className="h-48 w-full rounded-md object-cover" />
            ))}
          </div>
        ) : null}
        <p className="text-metadata text-text-secondary">{new Date(memory.occurredAt).toLocaleDateString()}</p>
        {memory.location ? <p className="text-metadata text-text-secondary">{memory.location}</p> : null}
        {memory.tags.length > 0 ? <p className="text-metadata text-text-secondary">{memory.tags.join(" · ")}</p> : null}
        {memory.description ? <p className="text-body text-text-primary">{memory.description}</p> : null}
        {memory.archivedAt ? <p className="text-metadata text-text-secondary">{t("detail.archivedNotice")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/pets/${petId}/memories/${memoryId}/edit`}>
            <Button variant="secondary">{t("detail.edit")}</Button>
          </Link>
          {memory.archivedAt ? (
            <Button variant="ghost" isLoading={isDeleting} onClick={handleRestore}>
              {t("detail.restore")}
            </Button>
          ) : (
            <Button variant="ghost" isLoading={isDeleting} onClick={handleArchive}>
              {t("detail.archive")}
            </Button>
          )}
        </div>
      </ContextSurface>
    </div>
  );
}
