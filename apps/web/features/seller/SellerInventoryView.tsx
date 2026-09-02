"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerOsOfferDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

/** Seller Inventory (spec section 41) — every change requires an explicit save; a rejected adjustment (would go negative) shows the server's own error rather than silently reverting. */
export function SellerInventoryView() {
  const t = useTranslations("seller.inventory");
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [offers, setOffers] = useState<SellerOsOfferDto[] | null>(null);
  const [error, setError] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      const page = await sellerOsService.listInventory(sellerId, { pageSize: 50 });
      setOffers(page.items);
      const nextDrafts: typeof drafts = {};
      for (const offer of page.items) if (offer.inventory) nextDrafts[offer.inventory.id] = String(offer.inventory.onHand);
      setDrafts(nextDrafts);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function save(inventoryItemId: string) {
    if (!sellerId) return;
    const value = drafts[inventoryItemId];
    if (value === undefined) return;
    setSavingId(inventoryItemId);
    setRowError((prev) => ({ ...prev, [inventoryItemId]: "" }));
    try {
      const updated = await sellerOsService.adjustInventory(sellerId, inventoryItemId, { mode: "ABSOLUTE", quantity: Number(value), reason: "Seller OS manual adjustment" });
      setOffers((prev) => prev?.map((o) => (o.inventory?.id === inventoryItemId ? updated : o)) ?? null);
    } catch {
      setRowError((prev) => ({ ...prev, [inventoryItemId]: t("adjustFailed") }));
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
          if (!offer.inventory) return null;
          const draft = drafts[offer.inventory.id] ?? String(offer.inventory.onHand);
          const dirty = Number(draft) !== offer.inventory.onHand;
          return (
            <ContextSurface key={offer.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-body font-medium text-text-primary">{offer.productTitle}</span>
                  <span className="text-metadata text-text-secondary">{offer.sellerSku ?? offer.sku}</span>
                </div>
                {offer.inventory.available <= 5 ? <StatusLabel tone="attention">{t("lowStock")}</StatusLabel> : null}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-metadata text-text-secondary">{t("reserved")}</span>
                  <span className="text-body text-text-primary">{offer.inventory.reserved}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-metadata text-text-secondary">{t("available")}</span>
                  <span className="text-body text-text-primary">{offer.inventory.available}</span>
                </div>
                <Input
                  label={t("onHand")}
                  type="number"
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [offer.inventory!.id]: e.target.value }))}
                  errorMessage={rowError[offer.inventory.id]}
                  className="w-32"
                />
                <Button size="sm" isLoading={savingId === offer.inventory.id} disabled={!dirty} onClick={() => save(offer.inventory!.id)}>
                  {t("save")}
                </Button>
              </div>
            </ContextSurface>
          );
        })
      )}
    </div>
  );
}
