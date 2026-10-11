"use client";

import { useEffect, useState } from "react";
import Link from "@/features/navigation/localized-link";
import { useTranslations } from "next-intl";
import { EmptyState, HandHeart, Skeleton, StatusLabel } from "@petlife/ui";
import { AnimalSupportNav } from "./AnimalSupportNav";
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
      <header className="section-head">
        <div>
          <h1>{t("orgList.title")}</h1>
          <p>{t("orgList.subtitle")}</p>
        </div>
      </header>
      <AnimalSupportNav />

      {page.items.length === 0 ? (
        <EmptyState title={t("orgList.empty")} />
      ) : (
        <ul className="org-rows">
          {page.items.map((org) => (
            <li key={org.id}>
              <Link href={`/animal-support/organizations/${org.id}`} className="org-row">
                {org.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoUrl} alt="" className="org-row__logo" loading="lazy" />
                ) : (
                  <span className="org-row__logo" aria-hidden="true"><HandHeart size={22} /></span>
                )}
                <span className="org-row__text">
                  <span className="org-row__name">{org.name}</span>
                  {org.location ? <span className="org-row__meta">{org.location}</span> : null}
                </span>
                {org.verificationStatus === "VERIFIED" ? <StatusLabel tone="success">{t("orgList.verified")}</StatusLabel> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
