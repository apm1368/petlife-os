"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderProfileDto, ProviderServiceDto } from "@petlife/types";
import { providersService } from "@/services/providers.service";
import { useActivePet } from "@/hooks/use-active-pet";
import { useBookingStore } from "@/stores/booking-store";

export function VetProfileView({ providerId }: { providerId: string }) {
  const t = useTranslations("vet.profile");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const { activePetId } = useActivePet();
  const updateBooking = useBookingStore((s) => s.update);
  const resetBooking = useBookingStore((s) => s.reset);

  const [provider, setProvider] = useState<ProviderProfileDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setProvider(await providersService.getProfile(providerId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  function bookService(service: ProviderServiceDto) {
    if (!provider || !activePetId) return;
    resetBooking();
    updateBooking({
      petId: activePetId,
      providerId: provider.id,
      providerName: provider.name,
      locationId: service.locationId ?? provider.locations[0]?.id ?? null,
      locationLabel: provider.locations[0] ? `${provider.locations[0].city} — ${provider.locations[0].addressLine}` : "",
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      priceAmount: service.priceAmount,
      currency: service.currency,
    });
    router.push(`/${locale}/vet/${provider.id}/book`);
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!provider) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-hero text-text-primary">{provider.name}</h1>
          {provider.verificationStatus === "VERIFIED" ? <StatusLabel tone="success">{t("verified")}</StatusLabel> : null}
        </div>
        {provider.description ? <p className="mt-1 text-body text-text-secondary">{provider.description}</p> : null}
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("locations")}</h2>
        {provider.locations.map((location) => (
          <p key={location.id} className="text-body text-text-secondary">
            {location.name ?? provider.name} — {location.addressLine}, {location.city}
          </p>
        ))}
      </ContextSurface>

      <div className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("services")}</h2>
        {provider.services.map((service) => (
          <ContextSurface key={service.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body text-text-primary">{service.name}</p>
              <p className="text-metadata text-text-secondary">{t("duration", { minutes: service.durationMinutes })}</p>
            </div>
            <Button variant="primary" size="sm" disabled={!activePetId} onClick={() => bookService(service)}>
              {t("book")}
            </Button>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
