"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, HeartPulse, MapPin, ShieldCheck, Skeleton } from "@petlife/ui";
import type { TravelDestinationDto } from "@petlife/types";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { useSessionStore } from "@/stores/session-store";
import { TravelSearchForm } from "./TravelSearchForm";
import { DiscoveryPage } from "@/features/discovery/DiscoveryPage";
import type { RouteLocale } from "@/lib/i18n/config";

/**
 * TRAVEL DISCOVERY PATTERN — home. Search first; destinations are real listing counts from the
 * server (never a marketing list); the promise is explained plainly: PET LIFE shows what each
 * property itself states about pets, and says so when it states nothing.
 */
export function TravelHomeView() {
  const externalT = useTranslations("externalTravel");
  const t = useTranslations("travelMarketplace");
  const lang = useLocale() as RouteLocale;
  const session = useSessionStore((s) => s.status);
  const [destinations, setDestinations] = useState<TravelDestinationDto[] | null>(null);

  useEffect(() => {
    travelMarketService.destinations().then(setDestinations).catch(() => setDestinations([]));
  }, []);

  return (
    <DiscoveryPage kind="travel">
      <Link className="underline" href={`/${lang}/travel/external`}>{externalT("title")}</Link>
      <section className="travel-hero">
      <header className="travel-hero__head">
        <p className="travel-hero__eyebrow">{t("heroEyebrow")}</p>
        <h1>{t("heroTitle")}</h1>
        <p>{t("heroDescription")}</p>
      </header>

      <TravelSearchForm />
      </section>

      <section aria-labelledby="dest-title" className="flex flex-col gap-4">
        <h2 id="dest-title" className="text-section-title text-text-primary">{t("destinationsTitle")}</h2>
        {destinations === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : destinations.length === 0 ? (
          <p className="text-body text-text-secondary">{t("destinationsEmpty")}</p>
        ) : (
          <ul className="dest-grid">
            {destinations.slice(0, 12).map((d) => (
              <li key={`${d.country}-${d.city}`}>
                <Link href={`/${lang}/travel/search?city=${encodeURIComponent(d.city)}`} className="dest-grid__item">
                  <span className="font-bold text-text-primary">{d.city}</span>
                  <span className="text-metadata text-text-secondary">{d.province ? `${d.province} · ` : ""}{t("stayCount", { count: d.listingCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-title" className="feature-trio">
        <h2 id="how-title" className="sr-only">{t("howTitle")}</h2>
        {[
          [ShieldCheck, t("rulesTitle"), t("rulesText")],
          [CalendarDays, t("availabilityTitle"), t("availabilityText")],
          [HeartPulse, t("readinessTitle"), t("readinessText")],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof ShieldCheck;
          return (
            <div key={title as string} className="feature-trio__item">
              <I aria-hidden className="h-6 w-6 text-brand-natural" />
              <h3 className="font-bold text-text-primary">{title as string}</h3>
              <p className="text-body text-text-secondary">{text as string}</p>
            </div>
          );
        })}
      </section>

      <nav aria-label={t("relatedAria")} className="flex flex-wrap gap-3">
        {session === "authenticated" ? <Link className="btn-quiet" href={`/${lang}/travel/trips`}>{t("myTrips")}</Link> : null}
        {session === "authenticated" ? <Link className="btn-quiet" href={`/${lang}/travel/favorites`}>{t("savedStays")}</Link> : null}
        <Link className="btn-quiet" href={`/${lang}/places`}><MapPin aria-hidden className="inline h-4 w-4" /> {t("petFriendlyPlaces")}</Link>
        <Link className="btn-quiet" href={`/${lang}/insurance`}>{t("petInsurance")}</Link>
      </nav>
    </DiscoveryPage>
  );
}
