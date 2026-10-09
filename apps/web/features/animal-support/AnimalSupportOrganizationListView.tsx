"use client";

import { useEffect, useState } from "react";
import Link from "@/features/navigation/localized-link";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, Skeleton } from "@petlife/ui";
import type { AnimalSupportOrganizationDto, PaginatedDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { LoadFailure } from "@/features/system/LoadFailure";

export function AnimalSupportOrganizationListView() {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");

  const [page, setPage] = useState<PaginatedDto<AnimalSupportOrganizationDto> | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setError(null);
    try {
      setPage(await animalSupportService.listOrganizations({ pageSize: 20 }));
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load();
     
  }, []);

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!page) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("orgList.title")}</h1>
        <p className="text-body text-text-secondary">{t("orgList.subtitle")}</p>
      </div>

      {page.items.length === 0 ? (
        <EmptyState title={t("orgList.empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {page.items.map((org) => (
            <Link key={org.id} href={`/animal-support/organizations/${org.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                {org.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoUrl} alt={org.name} className="h-24 w-full rounded-md object-cover" />
                ) : null}
                <span className="text-body text-text-primary">{org.name}</span>
                {org.location ? <p className="text-metadata text-text-secondary">{org.location}</p> : null}
                {org.verificationStatus === "VERIFIED" ? <p className="text-metadata text-state-success">{t("orgList.verified")}</p> : null}
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
