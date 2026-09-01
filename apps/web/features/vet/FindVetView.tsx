"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderSummaryDto } from "@petlife/types";
import { providersService } from "@/services/providers.service";
import { useActivePet } from "@/hooks/use-active-pet";

/**
 * Active Pet -> vet results, per spec: shows provider name, verification,
 * location, supported species, services, and next availability — never a
 * fabricated distance when geo data is missing (we simply never show one).
 */
export function FindVetView() {
  const t = useTranslations("vet.find");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();

  const [providers, setProviders] = useState<ProviderSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setProviders(await providersService.searchVets(activePet ? { species: activePet.species } : {}));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePet?.species]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!providers) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {activePet ? <p className="mt-1 text-body text-text-secondary">{t("subtitle", { name: activePet.name })}</p> : null}
      </div>

      {providers.length === 0 ? <EmptyState title={t("empty")} /> : null}

      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className="w-full text-start"
          onClick={() => router.push(`/${locale}/vet/${provider.id}`)}
        >
          <ContextSurface className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-medium text-text-primary">{provider.name}</p>
              {provider.verificationStatus === "VERIFIED" ? (
                <StatusLabel tone="success">{t("verified")}</StatusLabel>
              ) : null}
            </div>
            {provider.locations[0] ? (
              <p className="text-metadata text-text-secondary">
                {provider.locations[0].city}
                {provider.locations[0].addressLine ? ` — ${provider.locations[0].addressLine}` : ""}
              </p>
            ) : null}
            <p className="text-metadata text-text-secondary">{provider.services.map((s) => s.name).join(" · ")}</p>
            {provider.nextAvailableSlotStart ? (
              <StatusLabel tone="neutral">
                {t("nextAvailable", {
                  when: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(provider.nextAvailableSlotStart)),
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
