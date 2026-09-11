"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import type { PetDto, PetMemoryDto } from "@petlife/types";
import { PetLifecycleStatus } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";
import { MemoryMediaThumb } from "./MemoryMediaThumb";

type ViewMode = "JOURNAL" | "GALLERY";

/**
 * spec: Memorial mode must "suppress commercial/operational nudges" and
 * carry a respectful tone — this page never shows any commerce/booking
 * upsell, and its heading adapts once the pet's lifecycleStatus reads
 * DECEASED/MEMORIAL, matching the same status the backend already uses to
 * short-circuit Home ranking to a memories-only surface.
 *
 * Handoff 21 adds the diary browsing surfaces the spec asks for — text
 * search, tag and year filters, a journal/gallery view switch, and an
 * archive view with restore — all of which read the same filtered list
 * endpoint rather than fetching everything and filtering client-side.
 */
export function MemoriesListView({ petId }: { petId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");

  const [pet, setPet] = useState<PetDto | null>(null);
  const [memories, setMemories] = useState<PetMemoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [year, setYear] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("JOURNAL");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // `tCommon` is intentionally not a dependency: next-intl returns a fresh
  // function identity on every render, so including it would rebuild `load`
  // each render and make the effect below refetch forever.
  const load = useCallback(async () => {
    setError(null);
    try {
      const [petData, memoriesData] = await Promise.all([
        petsService.getById(petId),
        memoriesService.list(petId, {
          search: search.trim() || undefined,
          tag: tag || undefined,
          year: year ? Number(year) : undefined,
          includeArchived: showArchived || undefined,
        }),
      ]);
      setPet(petData);
      // The archive view shows only archived entries; the default view already excludes them server-side.
      setMemories(showArchived ? memoriesData.filter((m) => m.archivedAt !== null) : memoriesData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, search, tag, year, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(memoryId: string): Promise<void> {
    setRestoringId(memoryId);
    try {
      await memoriesService.restore(petId, memoryId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setRestoringId(null);
    }
  }

  /** Tag and year options come from the entries themselves — never a hardcoded list, per the spec's "keep extensible" rule. */
  const tagOptions = useMemo(() => Array.from(new Set((memories ?? []).flatMap((m) => m.tags))).sort(), [memories]);
  const yearOptions = useMemo(() => {
    const years = new Set((memories ?? []).map((m) => new Date(m.occurredAt).getFullYear()));
    // Keep the actively filtered year selectable even when the filtered result set no longer contains it.
    if (year) years.add(Number(year));
    return Array.from(years).sort((a, b) => b - a);
  }, [memories, year]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!pet || !memories) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isMemorial = pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;
  const hasFilters = search.trim() !== "" || tag !== "" || year !== "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">{isMemorial ? t("list.memorialTitle", { name: pet.name }) : t("list.title", { name: pet.name })}</h1>
          {isMemorial ? <p className="text-body text-text-secondary">{t("list.memorialSubtitle")}</p> : null}
        </div>
        <Link href={`/pets/${petId}/memories/new`}>
          <Button variant="primary">{t("list.addMemory")}</Button>
        </Link>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <Input label={t("list.searchLabel")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("list.searchPlaceholder")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={t("list.tagLabel")}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            options={[{ value: "", label: t("list.allTags") }, ...tagOptions.map((value) => ({ value, label: value }))]}
          />
          <Select
            label={t("list.yearLabel")}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={[{ value: "", label: t("list.allYears") }, ...yearOptions.map((value) => ({ value: String(value), label: String(value) }))]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={viewMode === "JOURNAL" ? "secondary" : "ghost"} onClick={() => setViewMode("JOURNAL")}>
            {t("list.viewJournal")}
          </Button>
          <Button variant={viewMode === "GALLERY" ? "secondary" : "ghost"} onClick={() => setViewMode("GALLERY")}>
            {t("list.viewGallery")}
          </Button>
          <Button variant={showArchived ? "secondary" : "ghost"} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t("list.hideArchived") : t("list.showArchived")}
          </Button>
        </div>
      </ContextSurface>

      {memories.length === 0 ? (
        <EmptyState title={showArchived ? t("list.emptyArchived") : hasFilters ? t("list.emptyFiltered") : t("list.empty")} />
      ) : viewMode === "GALLERY" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {memories.map((memory) => (
            <Link key={memory.id} href={`/pets/${petId}/memories/${memory.id}`} className="block">
              <MemoryMediaThumb petId={petId} memory={memory} className="h-32 w-full rounded-md object-cover" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groupByYear(memories).map(([groupYear, entries]) => (
            <section key={groupYear} className="flex flex-col gap-2">
              <h2 className="text-section-title text-text-secondary">{groupYear}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((memory) => {
                  const displayTitle = memory.title ?? new Date(memory.occurredAt).toLocaleDateString();
                  return (
                    <ContextSurface key={memory.id} className="flex flex-col gap-2">
                      <Link href={`/pets/${petId}/memories/${memory.id}`} className="flex flex-col gap-2">
                        <MemoryMediaThumb petId={petId} memory={memory} className="h-32 w-full rounded-md object-cover" />
                        <span className="text-body text-text-primary">{displayTitle}</span>
                        <p className="text-metadata text-text-secondary">{new Date(memory.occurredAt).toLocaleDateString()}</p>
                        {memory.tags.length > 0 ? <p className="text-metadata text-text-secondary">{memory.tags.join(" · ")}</p> : null}
                      </Link>
                      {memory.archivedAt ? (
                        <Button variant="ghost" isLoading={restoringId === memory.id} onClick={() => handleRestore(memory.id)}>
                          {t("list.restore")}
                        </Button>
                      ) : null}
                    </ContextSurface>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Link href={`/pets/${petId}/life-timeline`} className="text-body text-brand-mint underline">
        {t("list.viewLifeTimeline")}
      </Link>
    </div>
  );
}

/** The list arrives already sorted newest-first, so grouping preserves that order without re-sorting. */
function groupByYear(memories: PetMemoryDto[]): [number, PetMemoryDto[]][] {
  const groups = new Map<number, PetMemoryDto[]>();
  for (const memory of memories) {
    const entryYear = new Date(memory.occurredAt).getFullYear();
    const existing = groups.get(entryYear);
    if (existing) existing.push(memory);
    else groups.set(entryYear, [memory]);
  }
  return Array.from(groups.entries());
}
