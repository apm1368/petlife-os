"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PaginatedDto, SupportCampaignDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { ApiError } from "@/lib/api/client";
import { CampaignProgressBar } from "./CampaignProgressBar";

export function SupportCampaignListView() {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");

  const [page, setPage] = useState<PaginatedDto<SupportCampaignDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setPage(await animalSupportService.listCampaigns({ pageSize: 20 }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!page) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("campaignList.title")}</h1>
        <p className="text-body text-text-secondary">{t("campaignList.subtitle")}</p>
      </div>

      {page.items.length === 0 ? (
        <EmptyState title={t("campaignList.empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {page.items.map((campaign) => (
            <Link key={campaign.id} href={`/animal-support/campaigns/${campaign.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                <span className="text-body text-text-primary">{campaign.title}</span>
                <p className="text-metadata text-text-secondary">{campaign.organizationName}</p>
                <CampaignProgressBar raisedAmountIrr={campaign.raisedAmountIrr} targetAmountIrr={campaign.targetAmountIrr} />
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
