"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AnimalSupportOrganizationDto, PaginatedDto, RescueCaseDto, SupportCampaignDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { ApiError } from "@/lib/api/client";
import { CampaignProgressBar } from "./CampaignProgressBar";

export function AnimalSupportOrganizationDetailView({ organizationId }: { organizationId: string }) {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");

  const [org, setOrg] = useState<AnimalSupportOrganizationDto | null>(null);
  const [campaigns, setCampaigns] = useState<PaginatedDto<SupportCampaignDto> | null>(null);
  const [rescueCases, setRescueCases] = useState<PaginatedDto<RescueCaseDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [orgData, campaignData, rescueCaseData] = await Promise.all([
        animalSupportService.getOrganization(organizationId),
        animalSupportService.listCampaigns({ organizationId, pageSize: 20 }),
        animalSupportService.listRescueCases({ organizationId, pageSize: 20 }),
      ]);
      setOrg(orgData);
      setCampaigns(campaignData);
      setRescueCases(rescueCaseData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!org || !campaigns || !rescueCases) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <ContextSurface className="flex flex-col gap-2">
        {org.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={org.name} className="h-40 w-full rounded-md object-cover" />
        ) : null}
        <div className="flex items-center justify-between">
          <h1 className="text-page-title text-text-primary">{org.name}</h1>
          {org.verificationStatus === "VERIFIED" ? <StatusLabel tone="success">{t("orgDetail.verified")}</StatusLabel> : null}
        </div>
        {org.location ? <p className="text-metadata text-text-secondary">{org.location}</p> : null}
        {org.description ? <p className="text-body text-text-primary">{org.description}</p> : null}
      </ContextSurface>

      <div>
        <h2 className="text-section-title text-text-primary">{t("orgDetail.campaignsTitle")}</h2>
        {campaigns.items.length === 0 ? (
          <EmptyState title={t("orgDetail.campaignsEmpty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {campaigns.items.map((campaign) => (
              <Link key={campaign.id} href={`/animal-support/campaigns/${campaign.id}`}>
                <ContextSurface className="flex flex-col gap-1">
                  <span className="text-body text-text-primary">{campaign.title}</span>
                  <CampaignProgressBar raisedAmountIrr={campaign.raisedAmountIrr} targetAmountIrr={campaign.targetAmountIrr} />
                </ContextSurface>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-section-title text-text-primary">{t("orgDetail.rescueCasesTitle")}</h2>
        {rescueCases.items.length === 0 ? (
          <EmptyState title={t("orgDetail.rescueCasesEmpty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {rescueCases.items.map((rescueCase) => (
              <ContextSurface key={rescueCase.id} className="flex flex-col gap-1">
                <span className="text-body text-text-primary">{rescueCase.title}</span>
                <p className="text-metadata text-text-secondary">{rescueCase.description}</p>
              </ContextSurface>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
