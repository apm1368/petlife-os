"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ServiceCategory, ServiceSearchResultDto } from "@petlife/types";
import { servicesService } from "@/services/services.service";
import { useActivePet } from "@/hooks/use-active-pet";
import { useBookingStore } from "@/stores/booking-store";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_SUPPORTED: "urgent",
  UNKNOWN: "neutral",
};

/**
 * Category -> provider/service results (spec sections 30-31). Never shows a
 * fabricated distance or rating; compatibility is always shown with its
 * reason, never hidden (spec: "Never hide the reason").
 */
export function ServiceResultsView({ category }: { category: ServiceCategory }) {
  const t = useTranslations("services.results");
  const tCategory = useTranslations("services.explore");
  const tCompat = useTranslations("services.compatibility");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();
  const updateBooking = useBookingStore((s) => s.update);
  const resetBooking = useBookingStore((s) => s.reset);

  const [results, setResults] = useState<ServiceSearchResultDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setResults(null);
    try {
      setResults(await servicesService.search({ category, petId: activePet?.id }));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, activePet?.id]);

  function openBooking(result: ServiceSearchResultDto) {
    // A fresh selection must never carry over a previous attempt's hold,
    // address, or reason text — reset before repopulating the draft.
    resetBooking();
    updateBooking({
      petId: activePet?.id ?? null,
      category: result.service.category,
      providerId: result.provider.id,
      providerName: result.provider.name,
      locationId: result.location?.id ?? null,
      locationLabel: result.location ? `${result.location.city} — ${result.location.addressLine}` : "",
      locationMode: result.service.locationMode,
      serviceId: result.service.id,
      serviceName: result.service.name,
      durationMinutes: result.service.durationMinutes,
      priceAmount: result.service.priceAmount,
      currency: result.service.currency,
    });
    router.push(`/${locale}/services/${category}/${result.service.id}/book`);
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!results) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{tCategory(`category.${category}`)}</h1>
        {activePet ? <p className="mt-1 text-body text-text-secondary">{t("subtitle", { name: activePet.name })}</p> : null}
      </div>

      {results.length === 0 ? <EmptyState title={t("empty")} /> : null}

      {results.map((result) => (
        <button key={`${result.provider.id}-${result.service.id}`} type="button" className="w-full text-start" onClick={() => openBooking(result)}>
          <ContextSurface className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-medium text-text-primary">{result.provider.name}</p>
              {result.provider.verificationStatus === "VERIFIED" ? <StatusLabel tone="success">{t("verified")}</StatusLabel> : null}
            </div>
            <p className="text-metadata text-text-secondary">{result.service.name}</p>
            {result.location ? (
              <p className="text-metadata text-text-secondary">
                {result.location.city}
                {result.location.addressLine ? ` — ${result.location.addressLine}` : ""}
              </p>
            ) : null}
            {result.service.priceAmount ? (
              <p className="text-metadata text-text-secondary">
                {result.service.priceAmount.toLocaleString(locale)} {result.service.currency ?? ""}
              </p>
            ) : null}
            {result.compatibility ? (
              <StatusLabel tone={COMPATIBILITY_TONE[result.compatibility.status] ?? "neutral"}>
                {tCompat(`status.${result.compatibility.status}`)}
              </StatusLabel>
            ) : null}
            {result.nextAvailableSlotStart ? (
              <StatusLabel tone="neutral">
                {t("nextAvailable", {
                  when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(result.nextAvailableSlotStart)),
                })}
              </StatusLabel>
            ) : (
              <StatusLabel tone="attention">{t("noAvailability")}</StatusLabel>
            )}
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
