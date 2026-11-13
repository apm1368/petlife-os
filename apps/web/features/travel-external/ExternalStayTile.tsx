"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BedDouble, House, Hotel, Star, Trees, Users } from "@petlife/ui";
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
 * A compact stay card for the list: facts only (city, province, capacity, bedrooms, rating, "from" price, last
 * update, the pet line). The picture and description slots fill only when the source's image policy allows images
 * and a description exists (a licensed feed); otherwise a designed placeholder for the kind of stay shows.
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
  const sourceName = locale === "fa" ? stay.source.nameFa : stay.source.nameEn;
  // Same honesty rules as ExternalStayCard: "verified" only after opetlife staff checked; otherwise the source's claim,
  // and the five pet conditions read "unknown" unless the source states them.
  const verifiedByUs = stay.pet.authority === "ADMIN_CONFIRMED";
  const facts = petFacts(stay.pet.policy, (key, values) => t(key as never, values as never), (irr) => formatCurrency(irr, locale));
  const updatedAt = stay.lastSuccessfulSyncAt ?? stay.fromPrice?.observedAt ?? stay.lastSeenAt;

  return (
    <article className="xs-tile">
      <div className={`xs-tile__media xs-kind--${kind}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={stay.title ?? ""} loading="lazy" />
        ) : (
          <span className="xs-tile__placeholder" aria-hidden="true">
            <Icon size={36} />
            <span>{t(`tile.kind.${kind}`)}</span>
          </span>
        )}
        <span className="xs-tile__chip">{t("tile.sourceChip", { source: sourceName })}</span>
      </div>
      <div className="xs-tile__body">
        <h3 className="xs-tile__title">{stay.title ?? t("unnamed")}</h3>
        <p className="xs-tile__place">{[stay.city, stay.province].filter(Boolean).map((n) => placeName(n, locale)).join(locale === "fa" || locale === "ar" ? "، " : ", ")}</p>
        <ul className="xs-tile__facts">
          {stay.capacity !== null ? <li><Users size={14} aria-hidden="true" /> {t("tile.capacity", { count: nf.format(stay.capacity) })}</li> : null}
          {stay.bedrooms !== null ? <li><BedDouble size={14} aria-hidden="true" /> {t("tile.bedrooms", { count: nf.format(stay.bedrooms) })}</li> : null}
          {stay.rating !== null ? <li><Star size={14} aria-hidden="true" /> {nf.format(stay.rating)}{stay.reviewCount ? ` (${nf.format(stay.reviewCount)})` : ""}</li> : null}
        </ul>
        <p className="xs-tile__pet">
          {stay.pet.policyStatus === "CONFIRMED_ALLOWED" ? (verifiedByUs ? t("petVerifiedByOpetlife") : t("petPerSource", { source: sourceName })) : t(`policy.${stay.pet.policyStatus}`)}
        </p>
        {stay.pet.policyStatus !== "CONFIRMED_NOT_ALLOWED" ? (
          <ul className="xs-tile__conditions" aria-label={t("petFacts.title")}>
            {(["species", "size", "indoor", "fee", "approval"] as const).map((key) => (
              <li key={key}>
                <span>{t(`petFacts.${key}`)}</span>
                <span>{facts[key]}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {stay.descriptionSummary ? <p className="xs-tile__desc">{stay.descriptionSummary}</p> : null}
        {price ? (
          <p className="xs-tile__price"><bdi>{money(price.priceIrr!, price.currency ?? "IRR")}</bdi></p>
        ) : from ? (
          <p className="xs-tile__price">
            <bdi>{t("startingPrice", { amount: money(from.priceIrr, from.currency) })}</bdi>
            {from.priceBasis === "PER_NIGHT" ? <span className="xs-tile__basis"> · {t("basis.PER_NIGHT")}</span> : null}
          </p>
        ) : null}
        <p className="xs-tile__meta">{t("updatedAgo", { ago: timeAgo(updatedAt, locale) })}</p>
        <div className="xs-tile__actions">
          <Link className="underline" href={`/${locale}/travel/external/${stay.id}${suffix}`}>{t("details")}</Link>
          <a className="xs-tile__out" href={travelExternalService.outboundUrl(stay.id, context)} target="_blank" rel="noreferrer noopener">{t("viewOnSource", { source: sourceName })}</a>
        </div>
      </div>
    </article>
  );
}
