"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, StatusLabel } from "@petlife/ui";
import { HelpOfferStatus } from "@petlife/types";
import type { HelpOfferDto } from "@petlife/types";
import { formatDay, localizeDigits } from "@/lib/date/jalali";

export const OFFER_TONE: Record<HelpOfferStatus, "neutral" | "success" | "attention"> = {
  [HelpOfferStatus.PENDING]: "attention",
  [HelpOfferStatus.ACCEPTED]: "attention",
  [HelpOfferStatus.IN_PROGRESS]: "attention",
  [HelpOfferStatus.COMPLETED]: "success",
  [HelpOfferStatus.DECLINED]: "neutral",
  [HelpOfferStatus.CANCELLED]: "neutral",
};

/**
 * HELP / FULFILLMENT PATTERN — the publisher's inbox for one listing. Helpers are shown by what
 * they offered, never by contact details. Completing asks how much was actually delivered, which
 * is what moves the listing's progress.
 */
export function SupportOfferInbox({
  offers,
  busyId,
  onRespond,
}: {
  offers: HelpOfferDto[];
  busyId: string | null;
  onRespond: (offerId: string, status: HelpOfferStatus, fulfilledQuantity?: number) => void;
}) {
  const t = useTranslations("supportNeeds");
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [completing, setCompleting] = useState<string | null>(null);
  const [qty, setQty] = useState("");

  if (offers.length === 0) return <p className="text-metadata text-text-secondary">{t("mine.noOffers")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {offers.map((offer) => (
        <li key={offer.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel tone={OFFER_TONE[offer.status]}>{t(`offerStatus.${offer.status}`)}</StatusLabel>
            <span className="text-metadata text-text-secondary">{t(`category.${offer.helpType}`)}</span>
            {offer.quantity !== null ? <span className="text-metadata text-text-secondary">×{localizeDigits(offer.quantity, lang)}</span> : null}
            <span className="text-metadata text-text-secondary">· {formatDay(offer.createdAt.slice(0, 10), lang)}</span>
          </div>
          <p className="text-body text-text-primary">{offer.message}</p>
          {offer.timing ? <p className="text-metadata text-text-secondary">{fa ? "زمان: " : "Timing: "}{offer.timing}</p> : null}
          {offer.status === HelpOfferStatus.COMPLETED && offer.fulfilledQuantity !== null ? <p className="text-metadata text-state-success">{fa ? `تحویل‌شده: ${localizeDigits(offer.fulfilledQuantity, "fa")}` : `Delivered: ${offer.fulfilledQuantity}`}</p> : null}
          <div className="flex flex-wrap gap-2">
            {offer.status === HelpOfferStatus.PENDING ? (
              <>
                <Button variant="secondary" size="sm" isLoading={busyId === offer.id} onClick={() => onRespond(offer.id, HelpOfferStatus.ACCEPTED)}>{t("mine.acceptOffer")}</Button>
                <Button variant="ghost" size="sm" isLoading={busyId === offer.id} onClick={() => onRespond(offer.id, HelpOfferStatus.DECLINED)}>{t("mine.declineOffer")}</Button>
              </>
            ) : null}
            {offer.status === HelpOfferStatus.ACCEPTED ? (
              <Button variant="ghost" size="sm" isLoading={busyId === offer.id} onClick={() => onRespond(offer.id, HelpOfferStatus.IN_PROGRESS)}>{fa ? "شروع هماهنگی" : "Start handover"}</Button>
            ) : null}
            {offer.status === HelpOfferStatus.ACCEPTED || offer.status === HelpOfferStatus.IN_PROGRESS ? (
              completing === offer.id ? (
                <span className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col text-metadata">
                    {fa ? "مقدار تحویل‌شده" : "Amount delivered"}
                    <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))} className="min-h-10 w-28 rounded-md border border-border-subtle bg-surface-base px-2" />
                  </label>
                  <Button size="sm" isLoading={busyId === offer.id} onClick={() => { onRespond(offer.id, HelpOfferStatus.COMPLETED, qty ? Number(qty) : undefined); setCompleting(null); }}>{fa ? "ثبت انجام" : "Confirm"}</Button>
                </span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => { setCompleting(offer.id); setQty(offer.quantity !== null ? String(offer.quantity) : ""); }}>{t("mine.completeOffer")}</Button>
              )
            ) : null}
            {offer.status === HelpOfferStatus.ACCEPTED || offer.status === HelpOfferStatus.IN_PROGRESS ? (
              <Button variant="ghost" size="sm" isLoading={busyId === offer.id} onClick={() => onRespond(offer.id, HelpOfferStatus.CANCELLED)}>{fa ? "لغو هماهنگی" : "Cancel"}</Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
