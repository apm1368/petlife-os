"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import { Button, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentPublicDto, PaginatedDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { tehranDay } from "@/lib/date/tehran";
import { lostPetStatusTone } from "./lost-pet-status";
import { LoadFailure } from "@/features/system/LoadFailure";
import { FoundByNeighbours, LostPetAreaAlertCard } from "./LostPetNeighbourhood";

/** Public, paginated list of open incidents — approximate area only, never an exact location. */
export function PublicLostPetListView() {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");
  const lang = useLocale() as RouteLocale;
  const [data, setData] = useState<PaginatedDto<LostPetIncidentPublicDto> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [species, setSpecies] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await lostPetService.listPublic({ page, species: species || undefined }));
    } catch (err) {
      setError(err);
    }
  }, [page, species]);
  useEffect(() => void load(), [load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("public.list.title")}</h1>
        <p className="text-body text-text-secondary">{t("public.list.subtitle")}</p>
      </div>
      <LostPetAreaAlertCard />
      <div role="group" aria-label={t("public.list.speciesFilter")} className="flex flex-wrap gap-2">
        {[["", t("public.list.allSpecies")], ["DOG", t("species.dog")], ["CAT", t("species.cat")], ["OTHER", t("species.other")]].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={species === value} onClick={() => { setSpecies(value!); setPage(1); }} className={`min-h-11 rounded-full border px-4 text-sm ${species === value ? "border-brand-natural bg-brand-solid/10" : "border-border-subtle text-text-secondary"}`}>{label}</button>
        ))}
      </div>
      {error ? <LoadFailure error={error} onRetry={() => void load()} /> : !data ? (
        <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("list.empty")} description={t("public.list.emptyDescription")} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((incident) => (
              <li key={incident.id}>
                <Link href={`/${lang}/lost-pets/${incident.id}`} className="flex h-full flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-3 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {incident.primaryPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={incident.primaryPhotoUrl} alt={incident.petName} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-md object-cover" />
                  ) : (
                    <div className="opl-nophoto flex aspect-[4/3] items-center justify-center rounded-md bg-surface-subtle text-metadata text-text-secondary">{t("public.list.noPhoto")}</div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-text-primary">{incident.petName}</span>
                    <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
                  </div>
                  <p className="text-metadata text-text-secondary">{incident.approximateArea ?? t("list.noLocation")}</p>
                  {incident.lastSeenAt ? <p className="text-metadata text-text-secondary">{t("public.list.lastSeen", { date: formatDay(tehranDay(incident.lastSeenAt), lang) })}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
          {data.total > data.pageSize ? (
            <nav aria-label={t("public.list.paginationLabel")} className="flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("public.list.previous")}</Button>
              <span className="text-sm text-text-secondary">{localizeDigits(page, lang)} / {localizeDigits(Math.ceil(data.total / data.pageSize), lang)}</span>
              <Button variant="secondary" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>{t("public.list.next")}</Button>
            </nav>
          ) : null}
        </>
      )}
      <FoundByNeighbours />
    </div>
  );
}
