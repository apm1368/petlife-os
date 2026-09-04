"use client";

import { useTranslations } from "next-intl";
import { StatusLabel } from "@petlife/ui";
import type { ReferralDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthReferralsView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<ReferralDto>
      petId={petId}
      title={t("referrals.title")}
      emptyTitle={t("referrals.empty")}
      fetcher={healthAdvancedService.listReferrals}
      keyOf={(r) => r.id}
      renderItem={(referral) => (
        <>
          <div className="flex items-center justify-between">
            <span className="text-body text-text-primary">{referral.reason}</span>
            <StatusLabel tone={referral.status === "COMPLETED" ? "success" : referral.status === "CANCELLED" ? "neutral" : "attention"}>{referral.status}</StatusLabel>
          </div>
          <span className="text-metadata text-text-secondary">{referral.toProviderOrganizationName ?? referral.externalProviderName}</span>
        </>
      )}
    />
  );
}
