"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PublicDonationEntryDto, SupportCampaignDto, SupportCampaignUpdateDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { ApiError } from "@/lib/api/client";
import { supportNeedsService } from "@/services/support-needs.service";
import { CampaignProgressBar } from "./CampaignProgressBar";
import { DonationPanel } from "./DonationPanel";

export function SupportCampaignDetailView({ campaignId }: { campaignId: string }) {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");
  const params = useSearchParams();
  const needId = params.get("need");
  const [need, setNeed] = useState<{ id: string; title: string } | null>(null);

  const [campaign, setCampaign] = useState<SupportCampaignDto | null>(null);
  const [updates, setUpdates] = useState<SupportCampaignUpdateDto[] | null>(null);
  const [donors, setDonors] = useState<PublicDonationEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);


  async function load() {
    setError(null);
    try {
      const [campaignData, updatesData, donorsData] = await Promise.all([
        animalSupportService.getCampaign(campaignId),
        animalSupportService.listCampaignUpdates(campaignId),
        animalSupportService.listCampaignDonors(campaignId, 20),
      ]);
      setCampaign(campaignData);
      setUpdates(updatesData);
      setDonors(donorsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    if (!needId) return;
    // Only a live need linked to this campaign can be named as the purpose (the API re-checks).
    supportNeedsService.get(needId).then((n) => setNeed(n.campaignId === campaignId ? { id: n.id, title: n.title } : null)).catch(() => setNeed(null));
  }, [needId, campaignId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!campaign || !updates || !donors) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{campaign.title}</h1>
        <p className="text-metadata text-text-secondary">{campaign.organizationName}</p>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-body text-text-primary">{campaign.description}</p>
        <CampaignProgressBar raisedAmountIrr={campaign.raisedAmountIrr} targetAmountIrr={campaign.targetAmountIrr} />
        <p className="text-metadata text-text-secondary">{t("campaignDetail.fundType", { fundType: t(`fundType.${campaign.fundType}`) })}</p>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-4">
        <h2 className="text-section-title text-text-primary">{t("campaignDetail.donateTitle")}</h2>
        <DonationPanel campaign={campaign} need={need} onDonated={() => void load()} />
      </ContextSurface>

      <div>
        <h2 className="text-section-title text-text-primary">{t("campaignDetail.updatesTitle")}</h2>
        {updates.length === 0 ? (
          <EmptyState title={t("campaignDetail.updatesEmpty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {updates.map((update) => (
              <ContextSurface key={update.id} className="flex flex-col gap-1">
                <span className="text-body text-text-primary">{update.title}</span>
                <p className="text-body text-text-secondary">{update.body}</p>
              </ContextSurface>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-section-title text-text-primary">{t("campaignDetail.donorsTitle")}</h2>
        {donors.length === 0 ? (
          <EmptyState title={t("campaignDetail.donorsEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {donors.map((donor, index) => (
              <div key={index} className="flex items-center justify-between text-body text-text-primary">
                <span>{donor.displayName}</span>
                <span className="text-text-secondary">{donor.amountIrr.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
