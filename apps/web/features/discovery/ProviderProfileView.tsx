"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Clock3, EmptyState, ErrorRecovery, House, MapPin, Phone, ShieldCheck, Skeleton, Star, Stethoscope, Users } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { categoryLabel, providerTypeLabel } from "./labels";
import { formatCount } from "@/lib/number/format-number";
import { todayIso } from "@/lib/date/jalali";
import { WeekAvailability } from "./WeekAvailability";
import type { RouteLocale } from "@/lib/i18n/config";
import { SafetyTip } from "@/features/shared/SafetyTip";
import { placeName } from "@/lib/i18n/iran-places";

type Service = ProviderProfile["services"][number];

const VET_TYPES = new Set(["VET_CLINIC", "VET_HOSPITAL", "VETERINARIAN"]);

/**
 * PUBLIC ENTITY DETAIL PATTERN: identity + trust header, section anchors, then Services →
 * Availability → Team → About → Location → Reviews → Policies → FAQ beside one sticky booking
 * panel (a bottom action bar on phones). Every trust signal is real data: verification status,
 * published reviews from completed bookings, completed booking count. Veterinary providers lead
 * with their clinical team and specialties; nothing is shown when the provider has not supplied it.
 */
export function ProviderProfileView({ providerId }: { providerId: string }) {
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const t = useTranslations("providerProfile");
  const discoveryT = useTranslations("providerDiscovery");
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "ar" ? "ar" : locale === "nl" ? "nl-NL" : "en-GB";
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [weekService, setWeekService] = useState<string | null>(null);
  const [coverBroken, setCoverBroken] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setProfile(await discoveryService.profile(providerId));
      setState("ready");
    } catch (error) {
      const status = error instanceof ApiError
        ? error.status
        : typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
      setState(status === 404 ? "notFound" : "error");
    }
  }, [providerId]);
  useEffect(() => void load(), [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of profile?.services ?? []) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()];
  }, [profile]);

  if (state === "loading") return <Skeleton className="h-[32rem] w-full" aria-label={fa ? "در حال بارگیری" : t("loading")} />;
  if (state === "notFound") return <EmptyState title={fa ? "این ارائه‌دهنده در دسترس نیست" : t("notFoundTitle")} description={fa ? "ممکن است هنوز تأیید نشده یا غیرفعال شده باشد." : t("notFoundDescription")} />;
  if (state === "error" || !profile) return <ErrorRecovery title={fa ? "پروفایل بارگیری نشد" : t("loadFailed")} message="" retryLabel={fa ? "تلاش دوباره" : t("retry")} onRetry={load} />;

  const isVet = VET_TYPES.has(profile.type) || profile.services.some((s) => s.category === "VET");
  const bookHref = (serviceId?: string, date?: string) => {
    const q = new URLSearchParams();
    if (serviceId) q.set("serviceId", serviceId);
    if (date) q.set("date", date);
    return `/${locale}/providers/${profile.id}/book${q.toString() ? `?${q}` : ""}`;
  };
  const sep = fa ? "، " : ", ";
  const formatPrice = (amountRial: number) => `${Math.round(amountRial / 10).toLocaleString(dateLocale)} ${discoveryT("currencyUnit")}`;
  const teamName = (id: string) => profile.team.find((m) => m.providerUserId === id)?.displayName ?? null;
  const bookable = profile.services.filter((s) => s.locationId ?? profile.locations[0]?.id);
  const weekSvc = bookable.find((s) => s.id === weekService) ?? bookable[0] ?? null;
  const place = profile.locations[0] ? [profile.locations[0].region, profile.locations[0].city].filter(Boolean).join(sep) : null;
  const hasPolicies = Boolean(profile.policiesText || profile.services.some((s) => s.cancellationPolicy));
  const sections: { id: string; key: string }[] = [
    { id: "services", key: "services" },
    ...(weekSvc ? [{ id: "availability", key: "availability" }] : []),
    ...(profile.team.length ? [{ id: "team", key: isVet ? "veterinarians" : "team" }] : []),
    { id: "about", key: "about" },
    { id: "location", key: "location" },
    { id: "reviews", key: "reviews" },
    ...(hasPolicies ? [{ id: "policies", key: "policies" }] : []),
    ...(profile.faqs.length ? [{ id: "faq", key: "faq" }] : []),
  ];
  const lowestPrice = profile.services.map((sv) => sv.startingPrice).filter((p): p is number => !!p).sort((a, b) => a - b)[0] ?? null;
  const ratingText = profile.rating.count ? t("ratingSummary", { average: formatCount(profile.rating.average ?? 0, locale), count: formatCount(profile.rating.count, locale) }) : null;
  const allRequest = profile.services.length > 0 && profile.services.every((s) => s.bookingMode === "REQUEST");

  return (
    <article className="pd" data-kind={isVet ? "vet" : "service"}>
      <header className="pd-head">
        {profile.coverImageUrl && !coverBroken ? (
          <div className="pd-head__cover">
            <Image unoptimized src={profile.coverImageUrl} alt="" fill sizes="(max-width:1024px) 100vw, 1240px" priority onError={() => setCoverBroken(true)} />
          </div>
        ) : null}
        <div className="pd-head__identity">
          <div className="pd-head__logo">
            {profile.logoUrl ? <Image unoptimized src={profile.logoUrl} alt="" width={76} height={76} /> : <span aria-hidden="true">{isVet ? <Stethoscope size={30} /> : profile.name.trim().charAt(0)}</span>}
          </div>
          <div className="pd-head__text">
            <p className="pd-head__type">{discoveryT.has(`providerTypes.${profile.type}`) ? discoveryT(`providerTypes.${profile.type}`) : providerTypeLabel(profile.type, fa)}</p>
            <h1>{profile.name}</h1>
            <p className="pd-head__facts">
              {profile.verified ? <span className="pd-head__verified"><BadgeCheck size={16} aria-hidden="true" />{fa ? (isVet ? "هویت و پروانهٔ دامپزشکی تأییدشده" : "هویت و مجوز تأییدشده") : t(isVet ? "verifiedVet" : "verified")}</span> : null}
              {place ? <span><MapPin size={15} aria-hidden="true" />{place}</span> : null}
              {ratingText ? <span><Star size={15} aria-hidden="true" className="pd-star" />{ratingText}</span> : <span>{fa ? "هنوز نظری ثبت نشده" : t("noReviews")}</span>}
              {profile.completedBookings ? <span>{fa ? `${formatCount(profile.completedBookings, "fa")} نوبت انجام‌شده در اپت لایف` : t("completedBookings", { count: profile.completedBookings })}</span> : null}
            </p>
            {isVet && profile.specialties.length ? (
              <p className="pd-head__specialties"><span>{fa ? "تخصص‌ها:" : t("specialties")}</span> {profile.specialties.map((specialty) => discoveryT.has(`specialties.${specialty}`) ? discoveryT(`specialties.${specialty}`) : specialty).join(sep)}</p>
            ) : null}
          </div>
        </div>
        <nav aria-label={fa ? "بخش‌های پروفایل" : t("profileSections")} className="pd-anchors">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{t(`sections.${s.key}`)}</a>
          ))}
        </nav>
      </header>

      <div className="pd-layout">
        <div className="pd-main">
          <section id="services" className="pd-section" aria-labelledby="pd-services">
            <h2 id="pd-services">{fa ? (isVet ? t("vetServicesTitle") : t("servicesTitle")) : t(isVet ? "vetServicesTitle" : "servicesTitle")}</h2>
            {groups.map(([cat, services]) => (
              <div key={cat} className="pd-group">
                {groups.length > 1 ? <h3 className="pd-group__title">{discoveryT.has(`categories.${cat}`) ? discoveryT(`categories.${cat}`) : categoryLabel(cat, fa)}</h3> : null}
                <ul className="pd-services">
                  {services.map((s) => {
                    const staff = s.staffIds.map(teamName).filter((n): n is string => Boolean(n));
                    return (
                      <li key={s.id} className="pd-service">
                        <div className="pd-service__main">
                          <h4>{s.name}</h4>
                          <p className="pd-service__meta">
                            <span><Clock3 size={14} aria-hidden="true" />{t("duration", { count: s.durationMinutes })}</span>
                            {s.homeVisit ? <span><House size={14} aria-hidden="true" />{t("atHome")}</span> : null}
                            <span className={s.bookingMode === "REQUEST" ? "pd-mode pd-mode--request" : "pd-mode"}>{s.bookingMode === "REQUEST" ? t("approvalRequired") : t("instantBooking")}</span>
                          </p>
                          {s.description ? <p className="pd-service__desc">{s.description}</p> : null}
                          {staff.length ? <p className="pd-service__staff"><Users size={14} aria-hidden="true" />{staff.join(sep)}</p> : null}
                          {s.variants.length ? (
                            <ul className="pd-variants" aria-label={t("options")}>
                              {s.variants.map((v) => (
                                <li key={v.id}><span>{v.name}</span><span>{t("duration", { count: v.durationMinutes })}</span>{v.priceAmount ? <strong>{formatPrice(v.priceAmount)}</strong> : null}</li>
                              ))}
                            </ul>
                          ) : null}
                          {s.preparationNotes ? <p className="pd-service__prep"><strong>{t("beforeVisit")}</strong>{s.preparationNotes}</p> : null}
                        </div>
                        <div className="pd-service__side">
                          <p className="pd-service__price">{s.startingPrice ? <>{s.variants.length ? <small>{t("from")}</small> : null} {formatPrice(s.startingPrice)}</> : t("priceOnRequest")}</p>
                          <p className="pd-service__pay">{t(`paymentMode.${s.paymentMode}`)}{s.paymentMode === "DEPOSIT" && s.depositAmount ? ` · ${formatPrice(s.depositAmount)}` : ""}</p>
                          <Link href={bookHref(s.id)} className="pd-service__book">{t("bookService")}</Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {weekSvc ? (
            <section id="availability" className="pd-section" aria-labelledby="pd-availability">
              <div className="pd-section__head">
                <h2 id="pd-availability">{t("openingsTitle")}</h2>
                {bookable.length > 1 ? (
                  <label className="pd-week-select">
                    <span>{t("service")}</span>
                    <select value={weekSvc.id} onChange={(e) => setWeekService(e.target.value)}>
                      {bookable.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <WeekAvailability serviceId={weekSvc.id} locationId={(weekSvc.locationId ?? profile.locations[0]?.id)!} start={todayIso()} locale={locale} hrefFor={(day) => bookHref(weekSvc.id, day)} />
              <p className="pd-note">{t("availabilityNote")}</p>
            </section>
          ) : null}

          {profile.team.length ? (
            <section id="team" className="pd-section" aria-labelledby="pd-team">
              <h2 id="pd-team">{t(isVet ? "veterinarians" : "team")}</h2>
              <ul className="pd-team">
                {profile.team.map((m) => {
                  const services = m.serviceIds.map((id) => profile.services.find((s) => s.id === id)?.name).filter(Boolean);
                  return (
                    <li key={m.providerUserId}>
                      {m.avatarUrl ? <Image unoptimized src={m.avatarUrl} alt="" width={56} height={56} className="pd-team__avatar" /> : <span aria-hidden="true" className="pd-team__avatar pd-team__avatar--mono">{(m.displayName ?? "?").replace(/^دکتر\s+/, "").slice(0, 1)}</span>}
                      <div>
                        <p className="pd-team__name">{m.displayName}</p>
                        <p className="pd-team__role">{m.displayTitle ?? t(m.role === "VET" ? "veterinarian" : "specialist")}</p>
                        {m.publicBio ? <p className="pd-team__bio">{m.publicBio}</p> : null}
                        {services.length ? <p className="pd-team__services">{services.join(sep)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section id="about" className="pd-section" aria-labelledby="pd-about">
            <h2 id="pd-about">{t("about")}</h2>
            {profile.description ? <p className="pd-prose">{profile.description}</p> : <p className="pd-muted">{t("noDescription")}</p>}
            <dl className="pd-facts">
              <div><dt>{t("petsServed")}</dt><dd>{profile.petTypes.length ? profile.petTypes.map((petType) => petType === "DOG" ? discoveryT("species.dogs") : petType === "CAT" ? discoveryT("species.cats") : petType).join(fa ? " و " : locale === "de" ? " und " : locale === "es" ? " y " : locale === "ar" ? " و " : locale === "nl" ? " en " : " & ") : t("notStated")}</dd></div>
              <div><dt>{t("homeVisits")}</dt><dd>{profile.homeVisit ? t("available") : t("notOffered")}</dd></div>
              {!isVet && profile.specialties.length ? <div><dt>{t("specialties").replace(/:$/, "")}</dt><dd>{profile.specialties.join(sep)}</dd></div> : null}
              {allRequest ? <div><dt>{t("booking")}</dt><dd>{t("bookingNeedsApproval")}</dd></div> : null}
            </dl>
            {profile.galleryUrls.length ? (
              <ul className="pd-gallery" aria-label={t("gallery")}>
                {profile.galleryUrls.slice(0, 8).map((url) => (
                  <li key={url}><Image unoptimized src={url} alt="" fill sizes="25vw" /></li>
                ))}
              </ul>
            ) : null}
          </section>

          <section id="location" className="pd-section" aria-labelledby="pd-location">
            <h2 id="pd-location">{t("locationContact")}</h2>
            <ul className="pd-contact">
              {profile.locations.map((l) => (
                <li key={l.id}><MapPin size={16} aria-hidden="true" /><span>{[l.name, l.addressLine, placeName(l.region, locale), placeName(l.city, locale)].filter(Boolean).join(sep)}</span></li>
              ))}
              {profile.phone ? <li><Phone size={16} aria-hidden="true" /><a href={`tel:${profile.phone}`} dir="ltr">{profile.phone}</a></li> : null}
            </ul>
            <SafetyTip kind="contact" />
            {profile.type === "VET_CLINIC" && profile.locations[0]?.city ? (
              <p className="pd-muted">
                {t("travelling")} {" "}
                <Link className="pd-link" href={`/${locale}/travel/search?city=${encodeURIComponent(profile.locations[0].city)}`}>{t("petFriendlyStays", { city: placeName(profile.locations[0].city, locale) })}</Link>
              </p>
            ) : null}
          </section>

          <section id="reviews" className="pd-section" aria-labelledby="pd-reviews">
            <h2 id="pd-reviews">{t("customerReviews")}</h2>
            <div className="pd-review-summary">
              {profile.rating.count ? (
                <p className="pd-review-summary__score"><strong>{formatCount(profile.rating.average ?? 0, locale)}</strong><span>{t("ratingCountSummary", { count: formatCount(profile.rating.count, locale) })}</span></p>
              ) : null}
              <p className="pd-review-summary__rule"><ShieldCheck size={16} aria-hidden="true" />{t("completedBookingReviewRule")}</p>
            </div>
            {profile.reviews.length ? (
              <ul className="pd-reviews">
                {profile.reviews.map((r) => (
                  <li key={r.id}>
                    <p className="pd-reviews__head">
                      <span className="pd-stars" aria-label={t("starRating", { rating: formatCount(r.rating, locale) })}>{"★".repeat(r.rating)}<span aria-hidden="true">{"★".repeat(5 - r.rating)}</span></span>
                      <strong>{r.authorName}</strong>
                      {r.serviceName ? <span>{r.serviceName}</span> : null}
                      <time dateTime={r.createdAt}>{new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(r.createdAt))}</time>
                    </p>
                    {r.body ? <p className="pd-prose">{r.body}</p> : null}
                    {r.providerResponse ? <p className="pd-reviews__reply"><strong>{t("providerResponse")} </strong>{r.providerResponse}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pd-muted">{t("noReviews")}</p>
            )}
          </section>

          {hasPolicies ? (
            <section id="policies" className="pd-section" aria-labelledby="pd-policies">
              <h2 id="pd-policies">{t("policies")}</h2>
              {profile.policiesText ? <p className="pd-prose">{profile.policiesText}</p> : null}
              <ul className="pd-policies">
                {profile.services.filter((s) => s.cancellationPolicy).map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    <span>{t("freeCancellation", { hours: formatCount(s.freeCancellationHours, locale), percent: formatCount(s.lateCancellationRefundPercent, locale) })}</span>
                    <small>{s.cancellationPolicy}</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {profile.faqs.length ? (
            <section id="faq" className="pd-section" aria-labelledby="pd-faq">
              <h2 id="pd-faq">{t("faq")}</h2>
              {profile.faqs.map((f) => (
                <details key={f.question} className="pd-faq">
                  <summary>{f.question}</summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="provider-book-panel" aria-label={t("bookingPanel")}>
          <p className="provider-book-panel__type">{discoveryT.has(`providerTypes.${profile.type}`) ? discoveryT(`providerTypes.${profile.type}`) : providerTypeLabel(profile.type, fa)}</p>
          <p className="provider-book-panel__name">{profile.name}</p>
          <ul>
            {profile.verified ? <li><BadgeCheck size={16} aria-hidden="true" />{t(isVet ? "verifiedVet" : "verified")}</li> : null}
            <li><Star size={16} aria-hidden="true" />{ratingText ?? t("noReviews")}</li>
            {lowestPrice ? <li><span aria-hidden="true" className="provider-book-panel__dot" />{t("from")} {formatPrice(lowestPrice)}</li> : null}
          </ul>
          <Link href={bookHref()} className="provider-book-panel__cta">{t("bookAppointment")}</Link>
          <p className="provider-book-panel__note">{t("bookingTermsNote")}</p>
        </aside>
      </div>

      <div className="provider-sticky-cta" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="provider-sticky-cta__info">
          <strong>{profile.name}</strong>
          {lowestPrice ? <span>{t("from")} {formatPrice(lowestPrice)}</span> : null}
        </div>
        <Link href={bookHref()}>{t("bookAppointment")}</Link>
      </div>
    </article>
  );
}
