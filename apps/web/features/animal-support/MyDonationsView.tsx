"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { DonationHistoryItemDto, PaginatedDto } from "@petlife/types";
import { animalSupportService } from "@/services/animal-support.service";
import { ApiError } from "@/lib/api/client";

function donationStatusTone(status: DonationHistoryItemDto["status"]): "success" | "urgent" | "neutral" | "attention" {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "urgent";
    case "REFUNDED":
      return "neutral";
    default:
      return "attention";
  }
}

export function MyDonationsView() {
  const t = useTranslations("animalSupport");
  const tCommon = useTranslations("common");

  const [page, setPage] = useState<PaginatedDto<DonationHistoryItemDto> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage: number, append = false) {
    setError(null);
    try {
      const data = await animalSupportService.listMyDonations({ page: nextPage, pageSize: 20 });
      setPage((prev) => (append && prev ? { ...data, items: [...prev.items, ...data.items] } : data));
      setPageNumber(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={() => load(1)} />;
  if (!page) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("myDonations.title")}</h1>

      {page.items.length === 0 ? (
        <EmptyState title={t("myDonations.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {page.items.map((donation) => (
            <ContextSurface key={donation.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-body text-text-primary">{donation.campaignTitle}</span>
                <StatusLabel tone={donationStatusTone(donation.status)}>{t(`donationStatus.${donation.status}`)}</StatusLabel>
              </div>
              <p className="text-metadata text-text-secondary">{donation.organizationName}</p>
              <p className="text-body text-text-primary">{donation.amountIrr.toLocaleString()}</p>
            </ContextSurface>
          ))}
        </div>
      )}

      {page.items.length < page.total ? (
        <Button variant="secondary" onClick={() => load(pageNumber + 1, true)}>
          {tCommon("continue")}
        </Button>
      ) : null}
    </div>
  );
}
