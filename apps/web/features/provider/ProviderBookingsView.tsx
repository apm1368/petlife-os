"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { ProviderBookingSummaryDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderBookingRow } from "./ProviderBookingRow";

type FilterKey = "requests" | "today" | "upcoming" | "past" | "cancelled";
const FILTERS: FilterKey[] = ["requests", "today", "upcoming", "past", "cancelled"];

/** GET /provider/bookings with filters (spec sections 10-11) — provider only ever sees their own organization's bookings. */
export function ProviderBookingsView() {
  const t = useTranslations("provider.bookings");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en" | "de" | "es";

  const [filter, setFilter] = useState<FilterKey>("today");
  const [bookings, setBookings] = useState<ProviderBookingSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setBookings(null);
    try {
      setBookings(await providerOsService.listBookings({ [filter]: true }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? t("accessDenied") : t("loadFailed"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-metadata " +
              (filter === key ? "bg-surface-subtle text-text-primary" : "text-text-secondary")
            }
          >
            {t(`filter.${key}`)}
          </button>
        ))}
      </div>

      {error ? <ErrorRecovery title={t("title")} message={error} retryLabel={t("retry")} onRetry={load} /> : null}
      {!error && !bookings ? <Skeleton className="h-64 w-full" aria-label={t("loading")} /> : null}
      {!error && bookings && bookings.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {!error && bookings && bookings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {bookings.map((booking) => (
            <ProviderBookingRow
              key={booking.id}
              booking={booking}
              locale={locale}
              onClick={() => router.push(`/${locale}/provider/bookings/${booking.id}`)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
