"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SponsoredPlacementValue, SponsoredSlotDto } from "@petlife/types";
import { ShoppingBag, Stethoscope } from "@petlife/ui";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { sponsoredService, type SponsoredContext } from "@/services/sponsored.service";
import "./sponsored.css";

/**
 * At most two sponsored items in their own block above a list (owner #2). Every card carries the visible word
 * «تبلیغ» / "Sponsored" (never «ویژه», never only a colour or icon), says why it is shown, and links through the
 * logged click-out with rel="sponsored nofollow". Never part of the organic list or its ItemList JSON-LD; renders
 * nothing when there is no eligible campaign or the request fails.
 */
export function SponsoredSlots({ placement, context }: { placement: SponsoredPlacementValue; context?: SponsoredContext }) {
  const t = useTranslations("sponsored");
  const locale = useLocale() as RouteLocale;
  const [slots, setSlots] = useState<SponsoredSlotDto[]>([]);
  const key = JSON.stringify(context ?? {});

  useEffect(() => {
    const controller = new AbortController();
    sponsoredService
      .slots(placement, JSON.parse(key) as SponsoredContext, controller.signal)
      .then(setSlots)
      .catch(() => setSlots([]));
    return () => controller.abort();
  }, [placement, key]);

  if (!slots.length) return null;
  return (
    <section className="spn" aria-label={t("blockLabel")}>
      <ul className="spn__list">
        {slots.map((slot) => (
          <li key={slot.campaignId} className="spn-card">
            <a className="spn-card__link" href={sponsoredService.clickUrl(slot, locale)} rel="sponsored nofollow noopener">
              <span className="spn-card__media" aria-hidden="true">
                {slot.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the partner's own listing image
                  <img src={slot.imageUrl} alt="" loading="lazy" />
                ) : slot.kind === "PRODUCT" ? (
                  <ShoppingBag size={28} />
                ) : (
                  <Stethoscope size={28} />
                )}
              </span>
              <span className="spn-card__body">
                <span className="spn-card__label">{t("label")}</span>
                <strong className="spn-card__title">{slot.title}</strong>
                {slot.subtitle ? <span className="spn-card__sub">{slot.subtitle}</span> : null}
                {slot.priceIrr !== null ? <span className="spn-card__price">{formatCurrency(slot.priceIrr, locale)}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <details className="spn__why">
        <summary>{t("why")}</summary>
        <p>{t("explain")}</p>
      </details>
    </section>
  );
}
