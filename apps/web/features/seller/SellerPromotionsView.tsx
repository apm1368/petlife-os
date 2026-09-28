"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@petlife/ui";
import type { SellerOsOfferDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { PromotionManager, type PromotionApi } from "@/features/commerce/PromotionManager";

/** Seller-funded promotions, limited by the API to this seller's own products. */
export function SellerPromotionsView() {
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);
  const [offers, setOffers] = useState<SellerOsOfferDto[] | null>(null);

  useEffect(() => {
    if (!sellerId) return;
    void sellerOsService.listOffers(sellerId, { pageSize: 100 }).then((page) => setOffers(page.items)).catch(() => setOffers([]));
  }, [sellerId]);

  const api = useMemo<PromotionApi | null>(
    () =>
      sellerId
        ? {
            list: () => sellerOsService.listPromotions(sellerId),
            create: (input) => sellerOsService.createPromotion(sellerId, input),
            update: (id, input) => sellerOsService.updatePromotion(sellerId, id, input),
            transition: (id, status) => sellerOsService.transitionPromotion(sellerId, id, status),
          }
        : null,
    [sellerId],
  );
  const productOptions = useMemo(() => {
    const byProduct = new Map<string, string>();
    for (const o of offers ?? []) if (!byProduct.has(o.productId)) byProduct.set(o.productId, o.productTitle);
    return [...byProduct].map(([id, label]) => ({ id, label }));
  }, [offers]);

  if (!api || !offers) return <Skeleton className="h-64 w-full" />;
  return <PromotionManager api={api} mode="SELLER" productOptions={productOptions} />;
}
