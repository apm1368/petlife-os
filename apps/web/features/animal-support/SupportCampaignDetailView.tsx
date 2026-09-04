"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { PublicDonationEntryDto, SupportCampaignDto, SupportCampaignUpdateDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { ApiError } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session-store";
import { CampaignProgressBar } from "./CampaignProgressBar";

export function SupportCampaignDetailView({ campaignId }: { campaignId: string }) {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const locale = useLocale();

  const [campaign, setCampaign] = useState<SupportCampaignDto | null>(null);
  const [updates, setUpdates] = useState<SupportCampaignUpdateDto[] | null>(null);
  const [donors, setDonors] = useState<PublicDonationEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amountIrr, setAmountIrr] = useState("");
  const [showDonorPublicly, setShowDonorPublicly] = useState(false);
  const [isDonating, setIsDonating] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);
  const [donateSuccess, setDonateSuccess] = useState(false);

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

  async function handleDonate(): Promise<void> {
    const amount = Number(amountIrr);
    if (!amount || amount < 1000) return;
    setIsDonating(true);
    setDonateError(null);
    try {
      await animalSupportService.donate(campaignId, { amountIrr: amount, showDonorPublicly });
      setDonateSuccess(true);
      setAmountIrr("");
      await load();
    } catch (err) {
      setDonateError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsDonating(false);
    }
  }

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
        {status !== "authenticated" ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-text-secondary">{t("campaignDetail.loginToDonate")}</p>
            <Button variant="secondary" onClick={() => router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname)}`)}>
              {tCommon("logIn")}
            </Button>
          </div>
        ) : donateSuccess ? (
          <p className="text-body text-state-success">{t("campaignDetail.donateSuccess")}</p>
        ) : (
          <>
            <Input label={t("campaignDetail.amountLabel")} type="number" min={1000} value={amountIrr} onChange={(e) => setAmountIrr(e.target.value)} />
            <label className="flex items-center gap-2 text-body text-text-primary">
              <input type="checkbox" checked={showDonorPublicly} onChange={(e) => setShowDonorPublicly(e.target.checked)} />
              {t("campaignDetail.showDonorPublicly")}
            </label>
            {donateError ? <p className="text-body text-state-urgent">{donateError}</p> : null}
            <Button variant="primary" isLoading={isDonating} onClick={handleDonate} disabled={!amountIrr || Number(amountIrr) < 1000}>
              {t("campaignDetail.donateSubmit")}
            </Button>
          </>
        )}
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
