"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportNeedCategory, SupportNeedContactMode, SupportNeedUrgency } from "@petlife/types";
import type { SupportNeedListingDto } from "@petlife/types";
import { supportNeedsService, type SupportNeedOfferSummaryDto } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";
import { URGENCY_TONE } from "./SupportNeedsListView";
import { ShareLinkButtons } from "./ShareLinkButtons";

const HELP_TYPES: SupportNeedCategory[] = [
  SupportNeedCategory.FOOD,
  SupportNeedCategory.MEDICINE,
  SupportNeedCategory.VETERINARY_CARE,
  SupportNeedCategory.TEMPORARY_HOME,
  SupportNeedCategory.FOSTER,
  SupportNeedCategory.TRANSPORT,
  SupportNeedCategory.VOLUNTEER,
  SupportNeedCategory.EQUIPMENT,
  SupportNeedCategory.FINANCIAL,
  SupportNeedCategory.SHELTER_SUPPLIES,
  SupportNeedCategory.OTHER,
];

/**
 * Public listing detail. The publisher's contact details are never part of
 * this payload — helping goes through an in-product offer, and money goes
 * through the linked campaign's existing donation flow.
 */
export function SupportNeedDetailView({ listingId }: { listingId: string }) {
  const t = useTranslations("supportNeeds");
  const tCommon = useTranslations("common");

  const [listing, setListing] = useState<SupportNeedListingDto | null>(null);
  const [summary, setSummary] = useState<SupportNeedOfferSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [helpType, setHelpType] = useState<SupportNeedCategory>(SupportNeedCategory.FOOD);
  const [quantity, setQuantity] = useState("");
  const [isOffering, setIsOffering] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSent, setOfferSent] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function load() {
    setError(null);
    try {
      const [loaded, loadedSummary] = await Promise.all([supportNeedsService.get(listingId), supportNeedsService.getSummary(listingId)]);
      setListing(loaded);
      setSummary(loadedSummary);
      setHelpType(loaded.category);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  async function handleOffer(): Promise<void> {
    if (!message.trim()) return;
    setIsOffering(true);
    setOfferError(null);
    setNeedsSignIn(false);
    try {
      await supportNeedsService.offerHelp(listingId, {
        message: message.trim(),
        helpType,
        quantity: quantity ? Number(quantity) : undefined,
      });
      setOfferSent(true);
      setMessage("");
      setQuantity("");
      await load();
    } catch (err) {
      // 401/403 here means "sign in first", not a broken form.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setNeedsSignIn(true);
      else setOfferError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsOffering(false);
    }
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!listing) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const acceptsHelp = listing.contactMode !== SupportNeedContactMode.DONATE;
  const acceptsDonation = listing.contactMode !== SupportNeedContactMode.OFFER_HELP && listing.campaignId !== null;
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-page-title text-text-primary">{listing.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone="neutral">{t(`category.${listing.category}`)}</StatusLabel>
          {listing.urgency !== SupportNeedUrgency.NORMAL ? <StatusLabel tone={URGENCY_TONE[listing.urgency]}>{t(`urgency.${listing.urgency}`)}</StatusLabel> : null}
          {listing.organizationVerified ? <StatusLabel tone="success">{t("list.verifiedOrganization")}</StatusLabel> : null}
          {listing.status === "FULFILLED" ? <StatusLabel tone="success">{t("status.FULFILLED")}</StatusLabel> : null}
        </div>
        <p className="text-metadata text-text-secondary">
          {[listing.city, listing.province, listing.neighborhood].filter(Boolean).join(" · ")} · {new Date(listing.createdAt).toLocaleDateString()}
        </p>
        {listing.organizationName ? <p className="text-metadata text-text-secondary">{listing.organizationName}</p> : null}
      </div>

      {listing.imageUrls.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {listing.imageUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={listing.title} className="h-40 w-full rounded-md object-cover" />
          ))}
        </div>
      ) : null}

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-body text-text-primary">{listing.description}</p>
        {listing.animalType ? <p className="text-metadata text-text-secondary">{t("detail.animalType", { type: listing.animalType })}</p> : null}
        {summary && summary.neededQuantity !== null ? (
          <p className="text-body text-text-primary">
            {t("list.progress", { fulfilled: summary.fulfilledQuantity, needed: summary.neededQuantity, unit: listing.quantityUnit ?? "" })}
          </p>
        ) : null}
        {summary ? <p className="text-metadata text-text-secondary">{t("detail.offerCounts", { pending: summary.pendingOffers, accepted: summary.acceptedOffers, completed: summary.completedOffers })}</p> : null}
      </ContextSurface>

      {acceptsDonation && listing.campaignId ? (
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-body text-text-primary">{t("detail.donateTitle")}</span>
          <p className="text-metadata text-text-secondary">{t("detail.donateExplainer")}</p>
          <Link href={`/animal-support/campaigns/${listing.campaignId}`}>
            <Button variant="primary">{t("detail.donateAction")}</Button>
          </Link>
        </ContextSurface>
      ) : null}

      {acceptsHelp && listing.status === "PUBLISHED" ? (
        <ContextSurface className="flex flex-col gap-3">
          <span className="text-body text-text-primary">{t("detail.offerTitle")}</span>
          {offerSent ? (
            <p className="text-body text-state-success">{t("detail.offerSent")}</p>
          ) : (
            <>
              <p className="text-metadata text-text-secondary">{t("detail.contactExplainer")}</p>
              <Select
                label={t("detail.helpTypeLabel")}
                value={helpType}
                onChange={(e) => setHelpType(e.target.value as SupportNeedCategory)}
                options={HELP_TYPES.map((value) => ({ value, label: t(`category.${value}`) }))}
              />
              <Input label={t("detail.messageLabel")} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("detail.messagePlaceholder")} />
              <Input label={t("detail.quantityLabel")} hint={tCommon("optional")} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {needsSignIn ? (
                <Link href={`/login?returnTo=${encodeURIComponent(`/animal-support/needs/${listingId}`)}`} className="text-body text-brand-mint underline">
                  {t("detail.signInToHelp")}
                </Link>
              ) : null}
              {offerError ? <p className="text-body text-state-urgent">{offerError}</p> : null}
              <div>
                <Button variant="primary" isLoading={isOffering} onClick={handleOffer} disabled={!message.trim()}>
                  {t("detail.offerAction")}
                </Button>
              </div>
            </>
          )}
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-body text-text-primary">{t("detail.shareTitle")}</span>
        <ShareLinkButtons url={shareUrl} title={listing.title} />
      </ContextSurface>

      <Link href="/animal-support/needs" className="text-body text-brand-mint underline">
        {t("detail.backToBoard")}
      </Link>
    </div>
  );
}
