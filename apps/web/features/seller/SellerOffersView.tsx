"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerOsOfferDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { formatCurrency } from "@/lib/currency/format-currency";

/** Seller Offers (spec section 42) — price/status edits are explicit save actions, never silent auto-save; marketplace sync health is shown per offer, never hidden. */
export function SellerOffersView() {
  const t = useTranslations("seller.offers");
  const locale = useLocale() as "fa" | "en";
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [offers, setOffers] = useState<SellerOsOfferDto[] | null>(null);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { priceAmount: string; status: SellerOsOfferDto["status"] }>>({});

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      const page = await sellerOsService.listOffers(sellerId, { pageSize: 50 });
      setOffers(page.items);
      const nextDrafts: typeof drafts = {};
      for (const offer of page.items) nextDrafts[offer.id] = { priceAmount: String(offer.priceAmount), status: offer.status };
      setDrafts(nextDrafts);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function save(offerId: string) {
    if (!sellerId) return;
    const draft = drafts[offerId];
    if (!draft) return;
    setSavingId(offerId);
    try {
      const updated = await sellerOsService.updateOffer(sellerId, offerId, { priceAmount: Number(draft.priceAmount), status: draft.status });
      setOffers((prev) => prev?.map((o) => (o.id === offerId ? updated : o)) ?? null);
    } finally {
      setSavingId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!offers) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {offers.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        offers.map((offer) => {
          const draft = drafts[offer.id] ?? { priceAmount: String(offer.priceAmount), status: offer.status };
          const dirty = Number(draft.priceAmount) !== offer.priceAmount || draft.status !== offer.status;
          return (
            <ContextSurface key={offer.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-body font-medium text-text-primary">{offer.productTitle}</span>
                  <span className="text-metadata text-text-secondary">{offer.variantTitle ?? offer.sku}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {offer.inventory && offer.inventory.available <= 5 ? <StatusLabel tone="attention">{t("lowStock")}</StatusLabel> : null}
                  {offer.marketplaceSyncErrorCount > 0 ? <StatusLabel tone="urgent">{t("syncErrors", { count: offer.marketplaceSyncErrorCount })}</StatusLabel> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label={t("price")}
                  type="number"
                  value={draft.priceAmount}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [offer.id]: { ...draft, priceAmount: e.target.value } }))}
                  className="w-40"
                />
                <Select
                  label={t("status")}
                  value={draft.status}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [offer.id]: { ...draft, status: e.target.value as SellerOsOfferDto["status"] } }))}
                  options={[
                    { value: "ACTIVE", label: t("statusOptions.ACTIVE") },
                    { value: "PAUSED", label: t("statusOptions.PAUSED") },
                    { value: "SUSPENDED", label: t("statusOptions.SUSPENDED") },
                  ]}
                  className="w-40"
                />
                <Button size="sm" isLoading={savingId === offer.id} disabled={!dirty} onClick={() => save(offer.id)}>
                  {t("save")}
                </Button>
              </div>

              {offer.inventory ? (
                <p className="text-metadata text-text-secondary">{t("available", { count: offer.inventory.available, currency: formatCurrency(offer.priceAmount, locale) })}</p>
              ) : null}
            </ContextSurface>
          );
        })
      )}
    </div>
  );
}
