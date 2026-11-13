"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BusinessOverviewDto, BusinessReviewSnippetDto, BusinessServiceCardDto, BusinessShopCardDto } from "@petlife/types";
import { businessService } from "@/services/business.service";
import { providerOsService } from "@/services/provider-os.service";
import { sellerOsService } from "@/services/seller-os.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay, localizeDigits } from "@/lib/date/jalali";

type Lang = "fa" | "en" | "de" | "es";

const time = (iso: string, lang: Lang) =>
  localizeDigits(new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }), lang);

/** /business — every business the partner belongs to, with what needs them today, and a door into each console. */
export function BusinessHubView() {
  const t = useTranslations("businessHub");
  const lang = useLocale() as Lang;
  const router = useRouter();
  const [data, setData] = useState<BusinessOverviewDto | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await businessService.overview());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) return <ErrorRecovery title={t("failed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const none = data.services.length + data.shops.length === 0;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">{t("title")}</h1>
          <p className="text-body text-text-secondary">{none ? t("emptyHint") : t("intro")}</p>
        </div>
        {data.hasHousehold ? (
          <Link className="underline" href={`/${lang}/home`}>
            {t("toPetOwnerHome")}
          </Link>
        ) : null}
      </header>
      {none ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} actionLabel={t("joinAsPartner")} onAction={() => router.push(`/${lang}/partners/join`)} />
      ) : (
        <div className="business-hub__grid">
          {data.services.map((s) => (
            <ServiceCard key={s.providerOrganizationId} card={s} lang={lang} />
          ))}
          {data.shops.map((s) => (
            <ShopCard key={s.sellerOrganizationId} card={s} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

function Verification({ status, href }: { status: string; href: () => void }) {
  const t = useTranslations("businessHub");
  const tStatus = useTranslations("partnerVerification.statuses");
  const label = tStatus.has(status as "VERIFIED") ? tStatus(status as "VERIFIED") : status;
  if (status === "VERIFIED") return <StatusLabel tone="success">{label}</StatusLabel>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusLabel tone="attention">{label}</StatusLabel>
      <Button size="sm" variant="ghost" onClick={href}>
        {t("finishVerification")}
      </Button>
    </span>
  );
}

function Reviews({ reviews, lang }: { reviews: { average: number | null; count: number; latest: BusinessReviewSnippetDto[] }; lang: Lang }) {
  const t = useTranslations("businessHub");
  if (!reviews.count) return <p className="text-metadata text-text-secondary">{t("noReviews")}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-text-primary">{t("rating", { average: localizeDigits(String(reviews.average ?? "—"), lang), count: reviews.count })}</p>
      <ul className="business-card__list">
        {reviews.latest.map((r) => (
          <li key={r.id}>
            <span className="min-w-0 truncate">
              {r.productTitle ? <b>{r.productTitle}: </b> : null}
              {r.body ?? "—"}
            </span>
            <span aria-label={t("stars", { rating: r.rating })}>{"★".repeat(r.rating)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, lang }: { label: string; value: number; lang: Lang }) {
  return (
    <div className="business-card__stat">
      <b>{localizeDigits(String(value), lang)}</b>
      <span className="text-metadata text-text-secondary">{label}</span>
    </div>
  );
}

function ServiceCard({ card, lang }: { card: BusinessServiceCardDto; lang: Lang }) {
  const t = useTranslations("businessHub");
  const tRole = useTranslations("provider.shell.role");
  const tType = useTranslations("providerDiscovery.providerTypes");
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  // The provider console works on one active organization: choose this one, then open the page.
  const open = async (path: string) => {
    setOpening(path);
    try {
      await providerOsService.setContext(card.providerOrganizationId);
      router.push(`/${lang}/provider${path}`);
    } finally {
      setOpening(null);
    }
  };
  return (
    <section className="business-card" aria-labelledby={`svc-${card.providerOrganizationId}`}>
      <div className="business-card__head">
        <div className="min-w-0">
          <h2 id={`svc-${card.providerOrganizationId}`} className="text-section-title text-text-primary">{card.name}</h2>
          <p className="text-metadata text-text-secondary">
            {tType.has(card.type) ? tType(card.type) : card.type} · {tRole.has(card.role) ? tRole(card.role) : card.role}
          </p>
        </div>
        <Verification status={card.verificationStatus} href={() => void open("/verification")} />
      </div>
      <div className="business-card__stats">
        <Stat label={t("svc.today")} value={card.counts.today} lang={lang} />
        <Stat label={t("svc.upcoming")} value={card.counts.upcoming} lang={lang} />
        <Stat label={t("svc.pending")} value={card.counts.pendingConfirmation} lang={lang} />
      </div>
      <div>
        <h3 className="text-sm font-bold">{t("svc.next")}</h3>
        {card.nextBookings.length ? (
          <ul className="business-card__list">
            {card.nextBookings.map((b) => (
              <li key={b.id}>
                <span className="min-w-0 truncate">
                  {b.serviceName}
                  {b.petName ? ` · ${b.petName}` : ""}
                </span>
                <span>
                  {formatDay(b.startAt.slice(0, 10), lang)} · {time(b.startAt, lang)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-metadata text-text-secondary">{t("svc.noBookings")}</p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-bold">{t("svc.services", { active: card.services.active, total: card.services.total })}</h3>
        {card.services.items.length ? (
          <ul className="business-card__list">
            {card.services.items.map((s) => (
              <li key={s.id} className={s.isActive ? "" : "text-text-secondary"}>
                <span className="min-w-0 truncate">{s.name}</span>
                <span>
                  {s.priceAmount !== null ? formatCurrency(s.priceAmount, lang) : t("svc.noPrice")} · {t("svc.minutes", { minutes: s.durationMinutes })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-metadata text-text-secondary">{t("svc.noServices")}</p>
        )}
      </div>
      <Reviews reviews={card.reviews} lang={lang} />
      <div className="business-card__actions">
        <Button size="sm" isLoading={opening === ""} onClick={() => void open("")}>{t("svc.open")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/bookings"} onClick={() => void open("/bookings")}>{t("svc.bookings")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/calendar"} onClick={() => void open("/calendar")}>{t("svc.calendar")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/services"} onClick={() => void open("/services")}>{t("svc.servicesPrices")}</Button>
        <Button size="sm" variant="ghost" isLoading={opening === "/reviews"} onClick={() => void open("/reviews")}>{t("svc.reviews")}</Button>
        <Link className="self-center text-sm underline" href={`/${lang}/support/new?category=PROVIDER`}>{t("support")}</Link>
      </div>
    </section>
  );
}

function ShopCard({ card, lang }: { card: BusinessShopCardDto; lang: Lang }) {
  const t = useTranslations("businessHub");
  const tRole = useTranslations("seller.shell.role");
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const open = async (path: string) => {
    setOpening(path);
    try {
      await sellerOsService.setContext(card.sellerOrganizationId);
      router.push(`/${lang}/seller${path}`);
    } finally {
      setOpening(null);
    }
  };
  return (
    <section className="business-card" aria-labelledby={`shop-${card.sellerOrganizationId}`}>
      <div className="business-card__head">
        <div className="min-w-0">
          <h2 id={`shop-${card.sellerOrganizationId}`} className="text-section-title text-text-primary">{card.name}</h2>
          <p className="text-metadata text-text-secondary">
            {t("shop.kind")} · {tRole.has(card.role) ? tRole(card.role) : card.role}
          </p>
        </div>
        <Verification status={card.verificationStatus} href={() => void open("/verification")} />
      </div>
      <div className="business-card__stats">
        <Stat label={t("shop.toPrepare")} value={card.counts.ordersToPrepare} lang={lang} />
        <Stat label={t("shop.lowStock")} value={card.counts.lowStockOffers} lang={lang} />
        <Stat label={t("shop.pendingModeration")} value={card.counts.offersPendingModeration} lang={lang} />
        <Stat label={t("shop.activeOffers")} value={card.counts.activeOffers} lang={lang} />
      </div>
      {card.balance ? (
        <dl className="business-card__list">
          <div className="flex justify-between gap-3 text-sm">
            <dt>{t("shop.available")}</dt>
            <dd>{formatCurrency(card.balance.availableIrr, lang)}</dd>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <dt>{t("shop.pendingPayout")}</dt>
            <dd>{formatCurrency(card.balance.pendingIrr, lang)}</dd>
          </div>
        </dl>
      ) : null}
      <Reviews reviews={card.reviews} lang={lang} />
      <div className="business-card__actions">
        <Button size="sm" isLoading={opening === ""} onClick={() => void open("")}>{t("shop.open")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/orders"} onClick={() => void open("/orders")}>{t("shop.orders")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/offers"} onClick={() => void open("/offers")}>{t("shop.offers")}</Button>
        <Button size="sm" variant="secondary" isLoading={opening === "/inventory"} onClick={() => void open("/inventory")}>{t("shop.inventory")}</Button>
        {card.balance ? (
          <Button size="sm" variant="ghost" isLoading={opening === "/finance"} onClick={() => void open("/finance")}>{t("shop.payouts")}</Button>
        ) : null}
        <Link className="self-center text-sm underline" href={`/${lang}/support/new?category=SELLER`}>{t("support")}</Link>
      </div>
    </section>
  );
}
