"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { HelpOfferStatus, SupportNeedStatus } from "@petlife/types";
import type { HelpOfferDto, SupportNeedListingDto } from "@petlife/types";
import { supportNeedsService } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";

const TABS: (SupportNeedStatus | "ALL")[] = [
  "ALL",
  SupportNeedStatus.PUBLISHED,
  SupportNeedStatus.PENDING_REVIEW,
  SupportNeedStatus.FULFILLED,
  SupportNeedStatus.REJECTED,
  SupportNeedStatus.CLOSED,
];

const STATUS_TONE: Record<SupportNeedStatus, "neutral" | "success" | "attention" | "urgent"> = {
  [SupportNeedStatus.DRAFT]: "neutral",
  [SupportNeedStatus.PENDING_REVIEW]: "attention",
  [SupportNeedStatus.PUBLISHED]: "success",
  [SupportNeedStatus.FULFILLED]: "success",
  [SupportNeedStatus.CLOSED]: "neutral",
  [SupportNeedStatus.EXPIRED]: "neutral",
  [SupportNeedStatus.REJECTED]: "urgent",
  [SupportNeedStatus.REMOVED]: "urgent",
};

/** The publisher's own board: their listings across every status, plus the offers people have made. */
export function MySupportNeedsView() {
  const t = useTranslations("supportNeeds");
  const tCommon = useTranslations("common");

  const [tab, setTab] = useState<SupportNeedStatus | "ALL">("ALL");
  const [listings, setListings] = useState<SupportNeedListingDto[] | null>(null);
  const [offersByListing, setOffersByListing] = useState<Record<string, HelpOfferDto[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // `tCommon` is deliberately not a dependency: next-intl returns a new
  // translator identity each render, which would refetch in a loop.
  const load = useCallback(async () => {
    setError(null);
    setNeedsSignIn(false);
    try {
      const result = await supportNeedsService.listMine({ status: tab === "ALL" ? undefined : tab, pageSize: 50 });
      setListings(result.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setNeedsSignIn(true);
      else setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  async function respond(listingId: string, offerId: string, status: HelpOfferStatus): Promise<void> {
    setBusyId(offerId);
    try {
      await supportNeedsService.respondToOffer(listingId, offerId, { status });
      const offers = await supportNeedsService.listOffers(listingId);
      setOffersByListing((current) => ({ ...current, [listingId]: offers }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setBusyId(null);
    }
  }

  async function act(listingId: string, action: "fulfill" | "close"): Promise<void> {
    setBusyId(listingId);
    try {
      if (action === "fulfill") await supportNeedsService.markFulfilled(listingId);
      else await supportNeedsService.close(listingId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setBusyId(null);
    }
  }

  if (needsSignIn) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-page-title text-text-primary">{t("mine.title")}</h1>
        <p className="text-body text-text-secondary">{t("mine.signInPrompt")}</p>
        <Link href={`/login?returnTo=${encodeURIComponent("/animal-support/needs/mine")}`} className="text-body text-brand-mint underline">
          {tCommon("logIn")}
        </Link>
      </div>
    );
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;

  return (
    <div className="flex flex-col gap-5">
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
                  {t(`category.${listing.category}`)} · {listing.city} · {new Date(listing.createdAt).toLocaleDateString()}
                </p>
                {listing.reviewNote ? <p className="text-metadata text-state-urgent">{t("mine.reviewNote", { note: listing.reviewNote })}</p> : null}

                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => toggleOffers(listing.id)}>
                    {offers ? t("mine.hideOffers") : t("mine.viewOffers")}
                  </Button>
                  {listing.status === SupportNeedStatus.PUBLISHED ? (
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

                {offers ? (
                  offers.length === 0 ? (
                    <p className="text-metadata text-text-secondary">{t("mine.noOffers")}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {offers.map((offer) => (
                        <div key={offer.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusLabel tone={offer.status === HelpOfferStatus.COMPLETED ? "success" : offer.status === HelpOfferStatus.PENDING ? "attention" : "neutral"}>
                              {t(`offerStatus.${offer.status}`)}
                            </StatusLabel>
                            <span className="text-metadata text-text-secondary">{t(`category.${offer.helpType}`)}</span>
                            {offer.quantity !== null ? <span className="text-metadata text-text-secondary">×{offer.quantity}</span> : null}
                          </div>
                          <p className="text-body text-text-primary">{offer.message}</p>
                          {offer.status === HelpOfferStatus.PENDING ? (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" isLoading={busyId === offer.id} onClick={() => respond(listing.id, offer.id, HelpOfferStatus.ACCEPTED)}>
                                {t("mine.acceptOffer")}
                              </Button>
                              <Button variant="ghost" isLoading={busyId === offer.id} onClick={() => respond(listing.id, offer.id, HelpOfferStatus.DECLINED)}>
                                {t("mine.declineOffer")}
                              </Button>
                            </div>
                          ) : null}
                          {offer.status === HelpOfferStatus.ACCEPTED ? (
                            <div>
                              <Button variant="secondary" isLoading={busyId === offer.id} onClick={() => respond(listing.id, offer.id, HelpOfferStatus.COMPLETED)}>
                                {t("mine.completeOffer")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </ContextSurface>
            );
          })}
        </div>
      )}

      <Link href="/animal-support/needs" className="text-body text-brand-mint underline">
        {t("detail.backToBoard")}
      </Link>
    </div>
  );
}
