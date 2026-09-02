"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { MarketplaceChannelAccountDto, MarketplaceListingDto, MarketplaceProvider } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

/** DEV is never shown as a connectable channel in this UI (spec section 43: "do not show DEV channel in production UI") — only real providers appear here; DEV simulation is exercised through tests, never this screen. */
const CONNECTABLE_PROVIDERS: MarketplaceProvider[] = ["TOROB" as MarketplaceProvider, "DIGIKALA" as MarketplaceProvider];

function listingSyncTone(status: string): "success" | "attention" | "urgent" | "neutral" {
  if (status === "SYNCED") return "success";
  if (status === "DEGRADED") return "attention";
  if (status === "FAILED") return "urgent";
  return "neutral";
}

/** Seller Marketplace Channels + Listings (spec section 43-46) — sync errors are never hidden; connecting a channel never asks for pasted secrets (spec section 44). */
export function SellerChannelsView() {
  const t = useTranslations("seller.channels");
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [channels, setChannels] = useState<MarketplaceChannelAccountDto[] | null>(null);
  const [listings, setListings] = useState<MarketplaceListingDto[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reconcileResult, setReconcileResult] = useState<Record<string, string>>({});

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      const [channelList, listingPage] = await Promise.all([sellerOsService.listChannels(sellerId), sellerOsService.listMarketplaceListings(sellerId, { pageSize: 50 })]);
      setChannels(channelList);
      setListings(listingPage.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function connect(provider: MarketplaceProvider) {
    if (!sellerId) return;
    setBusyId(provider);
    try {
      const account = await sellerOsService.connectChannel(sellerId, provider);
      setChannels((prev) => [...(prev ?? []).filter((c) => c.provider !== provider), account]);
    } finally {
      setBusyId(null);
    }
  }

  async function syncListing(listingId: string) {
    if (!sellerId) return;
    setBusyId(listingId);
    try {
      const updated = await sellerOsService.syncMarketplaceListing(sellerId, listingId);
      setListings((prev) => prev?.map((l) => (l.id === listingId ? updated : l)) ?? null);
    } finally {
      setBusyId(null);
    }
  }

  async function reconcileListing(listingId: string) {
    if (!sellerId) return;
    setBusyId(listingId);
    try {
      const result = await sellerOsService.reconcileMarketplaceListing(sellerId, listingId);
      setReconcileResult((prev) => ({ ...prev, [listingId]: result.discrepancyType ? t(`discrepancy.${result.discrepancyType}`) : t("noDiscrepancy") }));
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!channels || !listings) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const connectedProviders = new Set(channels.map((c) => c.provider));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div>
        <h2 className="text-section-title text-text-primary">{t("connections")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {channels.map((channel) => (
            <ContextSurface key={channel.id} className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body font-medium text-text-primary">{channel.provider}</span>
                <span className="text-metadata text-text-secondary">
                  {channel.lastSuccessfulSyncAt ? t("lastSync", { when: new Date(channel.lastSuccessfulSyncAt).toLocaleString() }) : t("neverSynced")}
                </span>
              </div>
              <StatusLabel tone={channel.status === "CONNECTED" ? "success" : channel.status === "DEGRADED" || channel.status === "ERROR" ? "urgent" : "neutral"}>{channel.status}</StatusLabel>
            </ContextSurface>
          ))}
          {CONNECTABLE_PROVIDERS.filter((p) => !connectedProviders.has(p)).map((provider) => (
            <ContextSurface key={provider} className="flex items-center justify-between gap-3">
              <span className="text-body text-text-primary">{provider}</span>
              <Button size="sm" variant="secondary" isLoading={busyId === provider} onClick={() => connect(provider)}>
                {t("connect")}
              </Button>
            </ContextSurface>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-section-title text-text-primary">{t("listings")}</h2>
        {listings.length === 0 ? (
          <EmptyState title={t("noListings")} description={t("noListingsBody")} />
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {listings.map((listing) => (
              <ContextSurface key={listing.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body font-medium text-text-primary">{listing.provider}</span>
                  <div className="flex gap-1.5">
                    <StatusLabel tone="neutral">{listing.status}</StatusLabel>
                    <StatusLabel tone={listingSyncTone(listing.syncStatus)}>{listing.syncStatus}</StatusLabel>
                  </div>
                </div>
                {listing.lastErrorMessage ? <p className="text-metadata text-state-urgent">{listing.lastErrorMessage}</p> : null}
                {listing.publishedInventory !== null && listing.canonicalAvailableQuantity !== null && listing.publishedInventory !== listing.canonicalAvailableQuantity ? (
                  <p className="text-metadata text-state-attention">{t("inventoryMismatch", { published: listing.publishedInventory, canonical: listing.canonicalAvailableQuantity })}</p>
                ) : null}
                {reconcileResult[listing.id] ? <p className="text-metadata text-text-secondary">{reconcileResult[listing.id]}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" isLoading={busyId === listing.id} onClick={() => syncListing(listing.id)}>
                    {listing.externalListingId ? t("resync") : t("publish")}
                  </Button>
                  <Button size="sm" variant="ghost" isLoading={busyId === listing.id} onClick={() => reconcileListing(listing.id)}>
                    {t("reconcile")}
                  </Button>
                </div>
              </ContextSurface>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
