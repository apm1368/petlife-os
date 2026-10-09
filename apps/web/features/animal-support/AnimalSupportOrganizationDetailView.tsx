"use client";

import { useEffect, useState } from "react";
import Link from "@/features/navigation/localized-link";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import { supportNeedsService } from "@/services/support-needs.service";
import { localizeDigits } from "@/lib/date/jalali";
import type { AnimalSupportOrganizationDto, PaginatedDto, RescueCaseDto, SupportCampaignDto, SupportNeedListingDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { ReportContentPanel } from "@/features/shared/ReportContentPanel";
import { communityService } from "@/services/community.service";
import { CampaignProgressBar } from "./CampaignProgressBar";

export function AnimalSupportOrganizationDetailView({ organizationId }: { organizationId: string }) {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");

  const [org, setOrg] = useState<AnimalSupportOrganizationDto | null>(null);
  const [campaigns, setCampaigns] = useState<PaginatedDto<SupportCampaignDto> | null>(null);
  const [rescueCases, setRescueCases] = useState<PaginatedDto<RescueCaseDto> | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [openNeeds, setOpenNeeds] = useState<SupportNeedListingDto[] | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  useEffect(() => {
    supportNeedsService.list({ organizationId, state: "OPEN", pageSize: 10 }).then((r) => setOpenNeeds(r.items)).catch(() => setOpenNeeds([]));
    supportNeedsService.list({ organizationId, state: "RESOLVED", pageSize: 1 }).then((r) => setResolvedCount(r.total)).catch(() => setResolvedCount(0));
  }, [organizationId]);

  async function load() {
    setLoadError(null);
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
      setLoadError(err);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (loadError) return <LoadFailure error={loadError} onRetry={load} />;
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
        <p className="text-metadata text-text-secondary">{fa ? "برای کمک از دکمه‌های «پیشنهاد کمک» یا «کمک مالی» استفاده کنید؛ هماهنگی از طریق PET LIFE انجام می‌شود و اطلاعات تماس شخصی کسی نمایش داده نمی‌شود." : "To help, use “Offer help” or “Donate”; coordination happens through PET LIFE and nobody's personal contact details are shown."}</p>
        {org.contactEmail || org.contactPhone ? <p className="text-metadata text-text-secondary">{fa ? "تماس رسمی سازمان: " : "Official contact: "}<span dir="ltr">{[org.contactEmail, org.contactPhone].filter(Boolean).join(" · ")}</span></p> : null}
        <ReportContentPanel submit={(reason, details) => communityService.reportContent("ORGANIZATION", org.id, reason, details)} />
      </ContextSurface>

      <section aria-labelledby="org-needs" className="flex flex-col gap-2">
        <h2 id="org-needs" className="text-section-title text-text-primary">{fa ? "نیازهای باز" : "Open needs"}</h2>
        {openNeeds === null ? <Skeleton className="h-20" /> : openNeeds.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "در حال حاضر نیاز بازی ثبت نشده است." : "No open needs right now."}</p> : (
          <ul className="flex flex-col gap-2">{openNeeds.map((n) => (
            <li key={n.id}><Link href={`/${locale}/animal-support/needs/${n.id}`} className="flex flex-col rounded-md border border-border-subtle p-3 hover:border-border-strong"><span className="font-bold">{n.title}</span><span className="text-metadata text-text-secondary">{n.city}{n.neededQuantity !== null ? ` · ${localizeDigits(n.fulfilledQuantity, locale)}/${localizeDigits(n.neededQuantity, locale)}` : ""}</span></Link></li>
          ))}</ul>
        )}
        {resolvedCount ? <p className="text-metadata text-text-secondary">{fa ? `${localizeDigits(resolvedCount, "fa")} نیاز با کمک مردم تأمین شده است.` : `${resolvedCount} need(s) met with the community's help.`}</p> : null}
      </section>

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
