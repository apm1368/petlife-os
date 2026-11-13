"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BedDouble, ExternalLink, House, Hotel, Star, Trees, Users } from "@petlife/ui";
import { formatCurrency } from "@/lib/currency/format-currency";
import { placeName } from "@/lib/i18n/iran-places";
import { travelExternalService, type ExternalStay, type ExternalStayContext } from "@/services/travel-external.service";
import { matchingExternalPrice, petFacts, timeAgo } from "./ExternalStayCard";
import "./external-stay-tile.css";

type Kind = "villa" | "apartment" | "cottage" | "ecolodge" | "house";

/** The kind of stay, for the placeholder only: from the stored type, else from words in the title. */
export function stayKind(stay: Pick<ExternalStay, "stayType" | "title">): Kind {
  const text = `${stay.stayType ?? ""} ${stay.title ?? ""}`;
  if (/بوم\s?‌?گردی|ecolodge|eco-lodge/i.test(text)) return "ecolodge";
  if (/کلبه|cottage|cabin/i.test(text)) return "cottage";
  if (/آپارتمان|سوئیت|سوییت|apartment|suite/i.test(text)) return "apartment";
  if (/ویلا|villa/i.test(text)) return "villa";
  return "house";
}

const KIND_ICON = { villa: House, apartment: Hotel, cottage: Trees, ecolodge: Trees, house: House } as const;

/**
 * A stay card for the list (owner, 2026-11-13: readable, no source branding). Big title, city·province, capacity and
 * bedrooms, a clear "from … / night" price block, one short pet sentence with the five conditions folded away, and
 * one primary button that opens the exact listing in a new tab through the logged click-out. The picture slot fills
 * only when the source's image policy allows images (a licensed feed, `images` is [] otherwise); until then a
 * designed placeholder for the kind of stay shows the city. No source descriptions are shown.
 */
export function ExternalStayTile({ stay, context = {} }: { stay: ExternalStay; context?: ExternalStayContext }) {
  const t = useTranslations("externalTravel");
  const locale = useLocale() as "fa" | "en" | "de" | "es" | "ar" | "nl";
  const nf = new Intl.NumberFormat(locale);
  const kind = stayKind(stay);
  const Icon = KIND_ICON[kind];
  const price = matchingExternalPrice(stay, context);
  const from = !price && stay.fromPrice && ["FRESH", "AGING"].includes(stay.fromPrice.freshness) ? stay.fromPrice : null;
  const money = (amount: number, currency: string) => (currency === "IRR" ? formatCurrency(amount, locale) : `${nf.format(amount)} ${currency}`);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(context)) if (value !== undefined) query.set(key, String(value));
  const suffix = query.toString() ? `?${query}` : "";
  const image = stay.images[0] ?? null;
  // Same honesty rules as ExternalStayCard: "verified" only after opetlife staff checked; otherwise the source's claim,
  // and the five pet conditions read "unknown" unless the source states them.
  const verifiedByUs = stay.pet.authority === "ADMIN_CONFIRMED";
  const facts = petFacts(stay.pet.policy, (key, values) => t(key as never, values as never), (irr) => formatCurrency(irr, locale));
  const updatedAt = stay.lastSuccessfulSyncAt ?? stay.fromPrice?.observedAt ?? stay.lastSeenAt;

  const sep = locale === "fa" || locale === "ar" ? "، " : ", ";
  const place = [stay.city, stay.province].filter(Boolean).map((n) => placeName(n!, locale)).join(sep);
  const city = stay.city ? placeName(stay.city, locale) : null;
  const petLine = stay.pet.policyStatus === "CONFIRMED_ALLOWED" ? (verifiedByUs ? t("petVerifiedByOpetlife") : t("petPerListing")) : t(`policy.${stay.pet.policyStatus}`);

  return (
    <article className="xs-tile">
      <div className={`xs-tile__media xs-kind--${kind}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- only when the source's image policy allows it
          <img src={image} alt={stay.title ?? ""} loading="lazy" />
        ) : (
          <span className="xs-tile__placeholder" aria-hidden="true">
            <Icon size={34} />
            {city ? <strong>{city}</strong> : null}
            <span>{t(`tile.kind.${kind}`)}</span>
          </span>
        )}
      </div>
      <div className="xs-tile__body">
        <h3 className="xs-tile__title">{stay.title ?? t("unnamed")}</h3>
        {place ? <p className="xs-tile__place">{place}</p> : null}
        <ul className="xs-tile__facts">
          {stay.capacity !== null ? <li><Users size={15} aria-hidden="true" /> {t("tile.capacity", { count: nf.format(stay.capacity) })}</li> : null}
          {stay.bedrooms !== null ? <li><BedDouble size={15} aria-hidden="true" /> {t("tile.bedrooms", { count: nf.format(stay.bedrooms) })}</li> : null}
          {stay.rating !== null ? <li><Star size={15} aria-hidden="true" /> {nf.format(stay.rating)}{stay.reviewCount ? ` (${nf.format(stay.reviewCount)})` : ""}</li> : null}
        </ul>
        <div className="xs-tile__price">
          {price ? (
            <strong><bdi>{money(price.priceIrr!, price.currency ?? "IRR")}</bdi></strong>
          ) : from ? (
            <>
              <strong><bdi>{t("startingPrice", { amount: money(from.priceIrr, from.currency) })}</bdi></strong>
              {from.priceBasis === "PER_NIGHT" ? <span className="xs-tile__basis">/ {t("perNight")}</span> : null}
            </>
          ) : (
            <span className="xs-tile__basis">{t("priceOnListing")}</span>
          )}
        </div>
        <p className="xs-tile__pet">{petLine}</p>
        {stay.pet.policyStatus !== "CONFIRMED_NOT_ALLOWED" ? (
          <details className="xs-tile__conditions">
            <summary>{t("petFacts.title")}</summary>
            <ul>
              {(["species", "size", "indoor", "fee", "approval"] as const).map((key) => (
                <li key={key}>
                  <span>{t(`petFacts.${key}`)}</span>
                  <span>{facts[key]}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <a className="xs-tile__cta" href={travelExternalService.outboundUrl(stay.id, context)} target="_blank" rel="noopener nofollow">
          {t("viewStay")}
          <ExternalLink size={16} aria-hidden="true" />
          <span className="sr-only"> {t("opensNewTab")}</span>
        </a>
        <div className="xs-tile__foot">
          <Link href={`/${locale}/travel/external/${stay.id}${suffix}`}>{t("details")}</Link>
          <span>{t("updatedAgo", { ago: timeAgo(updatedAt, locale) })}</span>
        </div>
      </div>
    </article>
  );
}
