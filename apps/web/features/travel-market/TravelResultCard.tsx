"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Heart, StatusLabel, Star } from "@petlife/ui";
import type { TravelSearchResultItemDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";
import { amenityLabel, listingTypeLabel, matchTone, money, ratingText, type LocalizedTravelLocale } from "./labels";

export function TravelResultCard({ item, href, onFavorite, compareOn, onCompare, compareDisabled }: { item: TravelSearchResultItemDto; href: string; onFavorite?: () => void; compareOn?: boolean; onCompare?: () => void; compareDisabled?: boolean }) {
  const lang = useLocale() as LocalizedTravelLocale;
  const t = useTranslations("travelResults.card");
  const fa = lang === "fa";
  const p = item.petPolicySummary;
  const petLine = !p.stated
    ? t("petRulesUnknown")
    : [p.dogsAllowed ? t("dogs") : null, p.catsAllowed ? t("cats") : null].filter(Boolean).join(` ${t("and")} `) +
      (p.maxWeightKg !== null ? ` · ${t("upToWeight", { weight: lang === "fa" ? localizeDigits(p.maxWeightKg, "fa") : p.maxWeightKg })}` : "") +
      (p.petFeeIrr === 0 ? ` · ${t("noPetFee")}` : p.petFeeIrr ? ` · ${t("petFee", { amount: money(p.petFeeIrr, lang) })}` : "");
  const matchLabel = item.petMatch === "MATCH" ? t("fit") : item.petMatch === "POTENTIAL_CONFLICT" ? t("possibleConflict") : t("moreInfo");
  const formatNumber = (value: number, digits = 0) => lang === "fa" ? localizeDigits(value.toFixed(digits), "fa") : new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return (
    <article className="grid gap-3 overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated sm:grid-cols-[220px_1fr]">
      <div className="relative aspect-[4/3] bg-surface-subtle sm:aspect-auto sm:h-full">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-metadata text-text-secondary">{t("noPhoto")}</span>
        )}
        {onFavorite ? (
          <button type="button" onClick={onFavorite} aria-pressed={item.favorited} aria-label={item.favorited ? t("removeSaved") : t("save")} className="absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated/90 text-text-primary shadow focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <Heart aria-hidden className={`h-5 w-5 ${item.favorited ? "fill-current text-state-urgent" : ""}`} />
          </button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-4 sm:ps-0">
        <div className="flex flex-wrap items-center gap-2 text-metadata text-text-secondary">
          <span>{listingTypeLabel(item.type, lang)}</span>
          <span aria-hidden>·</span>
          <span>{item.city}{item.province ? `${fa ? "، " : ", "}${item.province}` : ""}</span>
          {item.distanceKm !== null ? <span>· {t("distanceKm", { distance: formatNumber(item.distanceKm, 1) })}</span> : null}
          {item.isVerified ? <span className="inline-flex items-center gap-1 text-state-success"><BadgeCheck aria-hidden className="h-4 w-4" />{t("verified")}</span> : null}
        </div>
        <h3 className="text-section-title text-text-primary">
          <Link href={href} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{item.title}</Link>
        </h3>
        <p className="flex items-center gap-1 text-metadata text-text-secondary"><Star aria-hidden className="h-4 w-4" />{ratingText(item.rating.average, item.rating.count, lang)}</p>
        <p className="text-sm text-text-primary">{petLine}</p>
        {item.petMatch ? <StatusLabel tone={matchTone(item.petMatch)}>{matchLabel}</StatusLabel> : null}
        {item.amenities.length ? <p className="truncate text-metadata text-text-secondary">{item.amenities.slice(0, 4).map((a) => amenityLabel(a, lang)).join(" · ")}</p> : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            {item.stay ? (
              <>
                <p className="text-numeric tabular-nums text-text-primary">{money(item.stay.totalIrr, lang)}</p>
                <p className="text-metadata text-text-secondary">{t("totalStay", { count: item.stay.nights })}{item.stay.petFeeIrr ? ` · ${t("includingPetFee")}` : ""}</p>
                {item.stay.freeCancellation ? <p className="text-metadata text-state-success">{t("freeCancellation")}</p> : null}
              </>
            ) : item.fromNightlyIrr !== null ? (
              <p className="text-sm text-text-primary">{t("fromNightly", { amount: money(item.fromNightlyIrr, lang) })}</p>
            ) : null}
            {item.bookingMode === "REQUEST_TO_BOOK" ? <p className="text-metadata text-text-secondary">{t("requestToBook")}</p> : <p className="text-metadata text-text-secondary">{t("instantBooking")}</p>}
          </div>
          {onCompare ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={!!compareOn} disabled={compareDisabled && !compareOn} onChange={onCompare} className="h-5 w-5" />
              {t("compare")}
            </label>
          ) : null}
        </div>
      </div>
    </article>
  );
}
