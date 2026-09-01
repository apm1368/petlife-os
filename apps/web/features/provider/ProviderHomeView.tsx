"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderOverviewDto } from "@petlife/types";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderBookingRow } from "./ProviderBookingRow";

/** Provider OS Home — "What needs my attention today?" (spec section 5). No vanity analytics. */
export function ProviderHomeView() {
  const t = useTranslations("provider.home");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [overview, setOverview] = useState<ProviderOverviewDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setOverview(null);
    try {
      setOverview(await providerOsService.getOverview());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!overview) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const attentionItems = [
    overview.pendingConfirmationCount > 0 ? { key: "pendingConfirmation", count: overview.pendingConfirmationCount } : null,
    overview.cancellationsRequiringAttentionCount > 0 ? { key: "cancellations", count: overview.cancellationsRequiringAttentionCount } : null,
    overview.availabilityIssueCount > 0 ? { key: "availabilityIssues", count: overview.availabilityIssueCount } : null,
  ].filter(Boolean) as { key: string; count: number }[];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {overview.location ? (
          <p className="mt-1 text-body text-text-secondary">
            {overview.location.name ?? overview.location.city}
          </p>
        ) : null}
      </div>

      {attentionItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <StatusLabel key={item.key} tone="attention">
              {t(`attention.${item.key}`, { count: item.count })}
            </StatusLabel>
          ))}
        </div>
      ) : (
        <StatusLabel tone="success">{t("attention.allClear")}</StatusLabel>
      )}

      {overview.nextBooking ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-metadata text-text-secondary">{t("nextBooking")}</p>
          <ProviderBookingRow
            booking={overview.nextBooking}
            locale={locale}
            onClick={() => router.push(`/${locale}/provider/bookings/${overview.nextBooking!.id}`)}
          />
        </ContextSurface>
      ) : null}

      <div>
        <p className="mb-2 text-section-title text-text-primary">{t("today", { count: overview.actionCounts.today })}</p>
        {overview.todaysBookings.length === 0 ? (
          <EmptyState title={t("noBookingsToday")} />
        ) : (
          <div className="flex flex-col gap-2">
            {overview.todaysBookings.map((booking) => (
              <ProviderBookingRow
                key={booking.id}
                booking={booking}
                locale={locale}
                onClick={() => router.push(`/${locale}/provider/bookings/${booking.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
