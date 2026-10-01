"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import { HelpOfferStatus, SupportNeedStatus } from "@petlife/types";
import type { HelpOfferDto, SupportNeedListingDto } from "@petlife/types";
import { supportNeedsService } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { SupportOfferInbox } from "./SupportOfferInbox";
import { LoadFailure } from "@/features/system/LoadFailure";
import { apiErrorText } from "@/lib/errors/api-error-text";

const TABS: (SupportNeedStatus | "ALL")[] = [
  "ALL",
  SupportNeedStatus.PUBLISHED,
  SupportNeedStatus.PARTIALLY_FULFILLED,
  SupportNeedStatus.PAUSED,
  SupportNeedStatus.PENDING_REVIEW,
  SupportNeedStatus.FULFILLED,
  SupportNeedStatus.REJECTED,
  SupportNeedStatus.CLOSED,
];

const STATUS_TONE: Record<SupportNeedStatus, "neutral" | "success" | "attention" | "urgent"> = {
  [SupportNeedStatus.DRAFT]: "neutral",
  [SupportNeedStatus.PENDING_REVIEW]: "attention",
  [SupportNeedStatus.PUBLISHED]: "success",
  [SupportNeedStatus.PARTIALLY_FULFILLED]: "success",
  [SupportNeedStatus.PAUSED]: "neutral",
  [SupportNeedStatus.FULFILLED]: "success",
  [SupportNeedStatus.CLOSED]: "neutral",
  [SupportNeedStatus.EXPIRED]: "neutral",
  [SupportNeedStatus.REJECTED]: "urgent",
  [SupportNeedStatus.REMOVED]: "urgent",
};

/** The publisher's own board: their listings across every status, plus the offers people have made. */
export function MySupportNeedsView() {
  const t = useTranslations("supportNeeds");
  const locale = useLocale();
  const tCommon = useTranslations("common");

  const [tab, setTab] = useState<SupportNeedStatus | "ALL">("ALL");
  const [listings, setListings] = useState<SupportNeedListingDto[] | null>(null);
  const [offersByListing, setOffersByListing] = useState<Record<string, HelpOfferDto[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // `tCommon` is deliberately not a dependency: next-intl returns a new
  // translator identity each render, which would refetch in a loop.
  const load = useCallback(async () => {
    setError(null);
    setLoadError(null);
    setNeedsSignIn(false);
    try {
      const result = await supportNeedsService.listMine({ status: tab === "ALL" ? undefined : tab, pageSize: 50 });
      setListings(result.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setNeedsSignIn(true);
      else setLoadError(err);
    }
     
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleOffers(listingId: string): Promise<void> {
    if (offersByListing[listingId]) {
      setOffersByListing((current) => {
        const next = { ...current };
        delete next[listingId];
        return next;
      });
      return;
    }
    try {
      const offers = await supportNeedsService.listOffers(listingId);
      setOffersByListing((current) => ({ ...current, [listingId]: offers }));
    } catch (err) {
      setError(apiErrorText(err, locale, tCommon("genericError")));
    }
  }

  async function respond(listingId: string, offerId: string, status: HelpOfferStatus, fulfilledQuantity?: number): Promise<void> {
    setBusyId(offerId);
    try {
      await supportNeedsService.respondToOffer(listingId, offerId, fulfilledQuantity !== undefined ? { status, fulfilledQuantity } : { status });
      const offers = await supportNeedsService.listOffers(listingId);
      setOffersByListing((current) => ({ ...current, [listingId]: offers }));
      await load();
    } catch (err) {
      setError(apiErrorText(err, locale, tCommon("genericError")));
    } finally {
      setBusyId(null);
    }
  }

  async function act(listingId: string, action: "fulfill" | "close" | "pause" | "resume"): Promise<void> {
    setBusyId(listingId);
    try {
      if (action === "fulfill") await supportNeedsService.markFulfilled(listingId);
      else if (action === "pause") await supportNeedsService.pause(listingId);
      else if (action === "resume") await supportNeedsService.resume(listingId);
      else await supportNeedsService.close(listingId);
      await load();
    } catch (err) {
      setError(apiErrorText(err, locale, tCommon("genericError")));
    } finally {
      setBusyId(null);
    }
  }

  if (needsSignIn) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-page-title text-text-primary">{t("mine.title")}</h1>
        <p className="text-body text-text-secondary">{t("mine.signInPrompt")}</p>
        <Link href={`/${locale}/welcome?returnTo=${encodeURIComponent(`/${locale}/animal-support/needs/mine`)}`} className="text-body text-brand-mint-strong underline">
          {tCommon("logIn")}
        </Link>
      </div>
    );
  }

  if (loadError) return <LoadFailure error={loadError} onRetry={load} />;

  return (
    <div className="flex flex-col gap-5">
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("mine.title")}</h1>
        <Link href="/animal-support/needs/new">
          <Button variant="primary">{t("list.publish")}</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((value) => (
          <Button key={value} variant={tab === value ? "secondary" : "ghost"} onClick={() => setTab(value)}>
            {value === "ALL" ? t("mine.tabAll") : t(`status.${value}`)}
          </Button>
        ))}
      </div>

      {!listings ? (
        <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />
      ) : listings.length === 0 ? (
        <EmptyState title={t("mine.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((listing) => {
            const offers = offersByListing[listing.id];
            return (
              <ContextSurface key={listing.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/animal-support/needs/${listing.id}`} className="text-body text-text-primary underline">
                    {listing.title}
                  </Link>
                  <StatusLabel tone={STATUS_TONE[listing.status]}>{t(`status.${listing.status}`)}</StatusLabel>
                </div>
                <p className="text-metadata text-text-secondary">
                  {t(`category.${listing.category}`)} · {listing.city} · {formatDay(listing.createdAt.slice(0, 10), locale as "fa" | "en")}{listing.neededQuantity !== null ? ` · ${localizeDigits(listing.fulfilledQuantity, locale as "fa" | "en")}/${localizeDigits(listing.neededQuantity, locale as "fa" | "en")}` : ""}
                </p>
                {listing.reviewNote ? <p className="text-metadata text-state-urgent">{t("mine.reviewNote", { note: listing.reviewNote })}</p> : null}

                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => toggleOffers(listing.id)}>
                    {offers ? t("mine.hideOffers") : t("mine.viewOffers")}
                  </Button>
                  <Link href={`/${locale}/animal-support/needs/${listing.id}/manage`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-brand-natural underline">{locale === "fa" ? "مدیریت" : "Manage"}</Link>
                  {listing.status === SupportNeedStatus.PUBLISHED || listing.status === SupportNeedStatus.PARTIALLY_FULFILLED ? (
                    <Button variant="ghost" isLoading={busyId === listing.id} onClick={() => act(listing.id, "pause")}>{locale === "fa" ? "توقف موقت" : "Pause"}</Button>
                  ) : null}
                  {listing.status === SupportNeedStatus.PAUSED ? (
                    <Button variant="ghost" isLoading={busyId === listing.id} onClick={() => act(listing.id, "resume")}>{locale === "fa" ? "ادامهٔ انتشار" : "Resume"}</Button>
                  ) : null}
                  {listing.status === SupportNeedStatus.PUBLISHED || listing.status === SupportNeedStatus.PARTIALLY_FULFILLED ? (
                    <Button variant="ghost" isLoading={busyId === listing.id} onClick={() => act(listing.id, "fulfill")}>
                      {t("mine.markFulfilled")}
                    </Button>
                  ) : null}
                  {listing.status !== SupportNeedStatus.CLOSED ? (
                    <Button variant="ghost" isLoading={busyId === listing.id} onClick={() => act(listing.id, "close")}>
                      {t("mine.close")}
                    </Button>
                  ) : null}
                </div>

                {offers ? <SupportOfferInbox offers={offers} busyId={busyId} onRespond={(offerId, status, quantity) => void respond(listing.id, offerId, status, quantity)} /> : null}
              </ContextSurface>
            );
          })}
        </div>
      )}

      <Link href="/animal-support/needs" className="text-body text-brand-mint-strong underline">
        {t("detail.backToBoard")}
      </Link>
    </div>
  );
}
