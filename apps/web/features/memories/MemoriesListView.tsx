"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Input, Select, Skeleton } from "@petlife/ui";
import type { PetDto, PetMemoryDto } from "@petlife/types";
import { PetLifecycleStatus } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { petsService } from "@/services/pets.service";
import { MemoryMediaThumb } from "./MemoryMediaThumb";
import { LoadFailure } from "@/features/system/LoadFailure";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { calendarFromIso, localizeDigits, monthName } from "@/lib/date/jalali";
import { apiErrorText } from "@/lib/errors/api-error-text";

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
  const fmt = useInstantFormat();
  const t = useTranslations("memories");
  const locale = useLocale();
  const tCommon = useTranslations("common");

  const [pet, setPet] = useState<PetDto | null>(null);
  const [memories, setMemories] = useState<PetMemoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

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
    setLoadError(null);
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
      setLoadError(err);
    }
     
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
      setError(apiErrorText(err, undefined, tCommon("genericError")));
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

  if (loadError) return <LoadFailure error={loadError} onRetry={load} />;
  if (!pet || !memories) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isMemorial = pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;
  const hasFilters = search.trim() !== "" || tag !== "" || year !== "";

  const hasMedia = (m: PetMemoryDto) => m.mediaObjectKeys.length > 0 || m.mediaUrls.length > 0;
  const system = locale === "fa" ? "jalali" : "gregorian";
  const dayParts = (iso: string) => {
    const tehranDay = new Date(new Date(iso).getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
    const c = calendarFromIso(system, tehranDay);
    return { day: localizeDigits(c.day, locale === "fa" ? "fa" : "en"), month: monthName(system, c.month, locale === "fa" ? "fa" : "en") };
  };

  return (
    <div className="mem">
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <header className="mem-head">
        <div>
          <h1 className="pl-title">{isMemorial ? t("list.memorialTitle", { name: pet.name }) : t("list.title", { name: pet.name })}</h1>
          {isMemorial ? <p className="mem-head__sub">{t("list.memorialSubtitle")}</p> : null}
        </div>
        <Link href={`/pets/${petId}/memories/new`}>
          <Button variant="primary">{t("list.addMemory")}</Button>
        </Link>
      </header>

      <div className="mem-filters">
        <Input label={t("list.searchLabel")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("list.searchPlaceholder")} />
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
          options={[{ value: "", label: t("list.allYears") }, ...yearOptions.map((value) => ({ value: String(value), label: locale === "fa" ? `${localizeDigits(value, "fa")} میلادی` : String(value) }))]}
        />
        <div className="mem-views" role="group" aria-label={t("list.viewJournal") + " / " + t("list.viewGallery")}>
          <button type="button" aria-pressed={viewMode === "JOURNAL" && !showArchived} onClick={() => { setViewMode("JOURNAL"); setShowArchived(false); }}>{t("list.viewJournal")}</button>
          <button type="button" aria-pressed={viewMode === "GALLERY" && !showArchived} onClick={() => { setViewMode("GALLERY"); setShowArchived(false); }}>{t("list.viewGallery")}</button>
          <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>{t("list.showArchived")}</button>
        </div>
      </div>

      {memories.length === 0 ? (
        <EmptyState title={showArchived ? t("list.emptyArchived") : hasFilters ? t("list.emptyFiltered") : t("list.empty")} />
      ) : viewMode === "GALLERY" && !showArchived ? (
        <ul className="mem-gallery">
          {memories.map((memory) => (
            <li key={memory.id}>
              <Link href={`/pets/${petId}/memories/${memory.id}`} className="mem-gallery__item">
                {hasMedia(memory) ? (
                  <MemoryMediaThumb petId={petId} memory={memory} className="mem-gallery__img" />
                ) : (
                  <span className="mem-gallery__text"><strong>{memory.title ?? fmt.date(memory.occurredAt)}</strong><span>{fmt.date(memory.occurredAt)}</span></span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mem-journal">
          {groupByYear(memories, locale === "fa").map(([groupYear, entries]) => (
            <section key={groupYear} className="mem-year" aria-labelledby={`mem-year-${groupYear}`}>
              <h2 id={`mem-year-${groupYear}`} className="mem-year__title">{localizeDigits(groupYear, locale === "fa" ? "fa" : "en")}</h2>
              <ol className="mem-timeline">
                {entries.map((memory) => {
                  const displayTitle = memory.title ?? fmt.date(memory.occurredAt);
                  const d = dayParts(memory.occurredAt);
                  return (
                    <li key={memory.id} className="mem-entry">
                      <span className="mem-entry__date" aria-hidden="true"><strong>{d.day}</strong><span>{d.month}</span></span>
                      <Link href={`/pets/${petId}/memories/${memory.id}`} className="mem-entry__body">
                        <span className="mem-entry__title">{displayTitle}</span>
                        <span className="mem-entry__meta">{fmt.date(memory.occurredAt)}{memory.tags.length > 0 ? ` · ${memory.tags.join(" · ")}` : ""}</span>
                      </Link>
                      {hasMedia(memory) ? <MemoryMediaThumb petId={petId} memory={memory} className="mem-entry__img" /> : null}
                      {memory.archivedAt ? (
                        <Button variant="ghost" isLoading={restoringId === memory.id} onClick={() => handleRestore(memory.id)}>
                          {t("list.restore")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <Link href={`/pets/${petId}/life-timeline`} className="mem-life-link">
        {t("list.viewLifeTimeline")}
      </Link>
    </div>
  );
}

/** The list arrives already sorted newest-first, so grouping preserves that order without re-sorting. */
/** Groups by the year in the UI calendar — Jalali on Persian pages, Gregorian on English ones. */
function groupByYear(memories: PetMemoryDto[], fa: boolean): [number, PetMemoryDto[]][] {
  const groups = new Map<number, PetMemoryDto[]>();
  for (const memory of memories) {
    const tehranDay = new Date(new Date(memory.occurredAt).getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
    const entryYear = fa ? calendarFromIso("jalali", tehranDay).year : new Date(memory.occurredAt).getFullYear();
    const existing = groups.get(entryYear);
    if (existing) existing.push(memory);
    else groups.set(entryYear, [memory]);
  }
  return Array.from(groups.entries());
}
