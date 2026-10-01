"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { BadgeCheck, Clock3, EmptyState, ErrorRecovery, House, MapPin, Phone, ShieldCheck, Skeleton, Star, Stethoscope, Users } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { categoryLabel, paymentModeLabel, providerTypeLabel } from "./labels";
import { formatCount } from "@/lib/number/format-number";
import { todayIso } from "@/lib/date/jalali";
import { WeekAvailability } from "./WeekAvailability";

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
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [weekService, setWeekService] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setProfile(await discoveryService.profile(providerId));
      setState("ready");
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? "notFound" : "error");
    }
  }, [providerId]);
  useEffect(() => void load(), [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of profile?.services ?? []) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()];
  }, [profile]);

  if (state === "loading") return <Skeleton className="h-[32rem] w-full" aria-label={fa ? "در حال بارگیری" : "Loading"} />;
  if (state === "notFound") return <EmptyState title={fa ? "این ارائه‌دهنده در دسترس نیست" : "This provider is not available"} description={fa ? "ممکن است هنوز تأیید نشده یا غیرفعال شده باشد." : "It may not be verified yet or may have been deactivated."} />;
  if (state === "error" || !profile) return <ErrorRecovery title={fa ? "پروفایل بارگیری نشد" : "Profile could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;

  const isVet = VET_TYPES.has(profile.type) || profile.services.some((s) => s.category === "VET");
  const bookHref = (serviceId?: string, date?: string) => {
    const q = new URLSearchParams();
    if (serviceId) q.set("serviceId", serviceId);
    if (date) q.set("date", date);
    return `/${locale}/providers/${profile.id}/book${q.toString() ? `?${q}` : ""}`;
  };
  const sep = fa ? "، " : ", ";
  const teamName = (id: string) => profile.team.find((m) => m.providerUserId === id)?.displayName ?? null;
  const bookable = profile.services.filter((s) => s.locationId ?? profile.locations[0]?.id);
  const weekSvc = bookable.find((s) => s.id === weekService) ?? bookable[0] ?? null;
  const place = profile.locations[0] ? [profile.locations[0].region, profile.locations[0].city].filter(Boolean).join(sep) : null;
  const hasPolicies = Boolean(profile.policiesText || profile.services.some((s) => s.cancellationPolicy));
  const sections = [
    { id: "services", fa: "خدمات", en: "Services" },
    ...(weekSvc ? [{ id: "availability", fa: "زمان‌های آزاد", en: "Availability" }] : []),
    ...(profile.team.length ? [{ id: "team", fa: isVet ? "دامپزشکان" : "تیم", en: isVet ? "Veterinarians" : "Team" }] : []),
    { id: "about", fa: "درباره", en: "About" },
    { id: "location", fa: "مکان", en: "Location" },
    { id: "reviews", fa: "نظرات", en: "Reviews" },
    ...(hasPolicies ? [{ id: "policies", fa: "قوانین", en: "Policies" }] : []),
    ...(profile.faqs.length ? [{ id: "faq", fa: "پرسش‌ها", en: "FAQ" }] : []),
  ];
  const lowestPrice = profile.services.map((sv) => sv.startingPrice).filter((p): p is number => !!p).sort((a, b) => a - b)[0] ?? null;
  const ratingText = profile.rating.count ? (fa ? `${formatCount(profile.rating.average ?? 0, "fa")} از ۵ · ${formatCount(profile.rating.count, "fa")} نظر` : `${profile.rating.average} of 5 · ${profile.rating.count} ${profile.rating.count === 1 ? "review" : "reviews"}`) : null;
  const allRequest = profile.services.length > 0 && profile.services.every((s) => s.bookingMode === "REQUEST");

  return (
    <article className="pd" data-kind={isVet ? "vet" : "service"}>
      <header className="pd-head">
        {profile.coverImageUrl ? (
          <div className="pd-head__cover">
            <Image unoptimized src={profile.coverImageUrl} alt="" fill sizes="(max-width:1024px) 100vw, 1240px" priority />
          </div>
        ) : null}
        <div className="pd-head__identity">
          <div className="pd-head__logo">
            {profile.logoUrl ? <Image unoptimized src={profile.logoUrl} alt="" width={76} height={76} /> : <span aria-hidden="true">{isVet ? <Stethoscope size={30} /> : profile.name.trim().charAt(0)}</span>}
          </div>
          <div className="pd-head__text">
            <p className="pd-head__type">{providerTypeLabel(profile.type, fa)}</p>
            <h1>{profile.name}</h1>
            <p className="pd-head__facts">
              {profile.verified ? <span className="pd-head__verified"><BadgeCheck size={16} aria-hidden="true" />{isVet ? (fa ? "هویت و پروانهٔ دامپزشکی تأییدشده" : "Identity and veterinary license verified") : fa ? "هویت و مجوز تأییدشده" : "Identity and license verified"}</span> : null}
              {place ? <span><MapPin size={15} aria-hidden="true" />{place}</span> : null}
              {ratingText ? <span><Star size={15} aria-hidden="true" className="pd-star" />{ratingText}</span> : <span>{fa ? "هنوز نظری ثبت نشده" : "No reviews yet"}</span>}
              {profile.completedBookings ? <span>{fa ? `${formatCount(profile.completedBookings, "fa")} نوبت انجام‌شده در پت‌لایف` : `${profile.completedBookings} bookings completed on PET LIFE`}</span> : null}
            </p>
            {isVet && profile.specialties.length ? (
              <p className="pd-head__specialties"><span>{fa ? "تخصص‌ها:" : "Specialties:"}</span> {profile.specialties.join(sep)}</p>
            ) : null}
          </div>
        </div>
        <nav aria-label={fa ? "بخش‌های پروفایل" : "Profile sections"} className="pd-anchors">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{fa ? s.fa : s.en}</a>
          ))}
        </nav>
      </header>

      <div className="pd-layout">
        <div className="pd-main">
          <section id="services" className="pd-section" aria-labelledby="pd-services">
            <h2 id="pd-services">{isVet ? (fa ? "نوبت‌ها و خدمات درمانی" : "Appointments and services") : fa ? "خدمات و قیمت‌ها" : "Services and prices"}</h2>
            {groups.map(([cat, services]) => (
              <div key={cat} className="pd-group">
                {groups.length > 1 ? <h3 className="pd-group__title">{categoryLabel(cat, fa)}</h3> : null}
                <ul className="pd-services">
                  {services.map((s) => {
                    const staff = s.staffIds.map(teamName).filter((n): n is string => Boolean(n));
                    return (
                      <li key={s.id} className="pd-service">
                        <div className="pd-service__main">
                          <h4>{s.name}</h4>
                          <p className="pd-service__meta">
                            <span><Clock3 size={14} aria-hidden="true" />{fa ? `${formatCount(s.durationMinutes, "fa")} دقیقه` : `${s.durationMinutes} min`}</span>
                            {s.homeVisit ? <span><House size={14} aria-hidden="true" />{fa ? "در منزل" : "At home"}</span> : null}
                            <span className={s.bookingMode === "REQUEST" ? "pd-mode pd-mode--request" : "pd-mode"}>{s.bookingMode === "REQUEST" ? (fa ? "نیازمند تأیید ارائه‌دهنده" : "Provider approval required") : fa ? "رزرو فوری" : "Instant booking"}</span>
                          </p>
                          {s.description ? <p className="pd-service__desc">{s.description}</p> : null}
                          {staff.length ? <p className="pd-service__staff"><Users size={14} aria-hidden="true" />{staff.join(sep)}</p> : null}
                          {s.variants.length ? (
                            <ul className="pd-variants" aria-label={fa ? "گزینه‌ها" : "Options"}>
                              {s.variants.map((v) => (
                                <li key={v.id}><span>{v.name}</span><span>{fa ? `${formatCount(v.durationMinutes, "fa")} دقیقه` : `${v.durationMinutes} min`}</span>{v.priceAmount ? <strong>{formatCurrency(v.priceAmount, locale)}</strong> : null}</li>
                              ))}
                            </ul>
                          ) : null}
                          {s.preparationNotes ? <p className="pd-service__prep"><strong>{fa ? "آمادگی قبل از مراجعه: " : "Before you come: "}</strong>{s.preparationNotes}</p> : null}
                        </div>
                        <div className="pd-service__side">
                          <p className="pd-service__price">{s.startingPrice ? <>{s.variants.length ? <small>{fa ? "از" : "From"}</small> : null} {formatCurrency(s.startingPrice, locale)}</> : fa ? "قیمت پس از استعلام" : "Price on request"}</p>
                          <p className="pd-service__pay">{paymentModeLabel(s.paymentMode, fa)}{s.paymentMode === "DEPOSIT" && s.depositAmount ? ` · ${formatCurrency(s.depositAmount, locale)}` : ""}</p>
                          <Link href={bookHref(s.id)} className="pd-service__book">{fa ? "رزرو این خدمت" : "Book this"}</Link>
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
                <h2 id="pd-availability">{fa ? "زمان‌های آزاد هفت روز آینده" : "Openings in the next seven days"}</h2>
                {bookable.length > 1 ? (
                  <label className="pd-week-select">
                    <span>{fa ? "خدمت" : "Service"}</span>
                    <select value={weekSvc.id} onChange={(e) => setWeekService(e.target.value)}>
                      {bookable.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <WeekAvailability serviceId={weekSvc.id} locationId={(weekSvc.locationId ?? profile.locations[0]?.id)!} start={todayIso()} locale={locale} hrefFor={(day) => bookHref(weekSvc.id, day)} />
              <p className="pd-note">{fa ? "تعداد زمان‌ها همان است که ارائه‌دهنده باز گذاشته؛ با انتخاب یک روز به مرحلهٔ رزرو می‌روید." : "Counts are the times the provider has opened; choose a day to continue booking."}</p>
            </section>
          ) : null}

          {profile.team.length ? (
            <section id="team" className="pd-section" aria-labelledby="pd-team">
              <h2 id="pd-team">{isVet ? (fa ? "دامپزشکان و تیم درمان" : "Veterinarians and care team") : fa ? "تیم" : "Team"}</h2>
              <ul className="pd-team">
                {profile.team.map((m) => {
                  const services = m.serviceIds.map((id) => profile.services.find((s) => s.id === id)?.name).filter(Boolean);
                  return (
                    <li key={m.providerUserId}>
                      {m.avatarUrl ? <Image unoptimized src={m.avatarUrl} alt="" width={56} height={56} className="pd-team__avatar" /> : <span aria-hidden="true" className="pd-team__avatar pd-team__avatar--mono">{(m.displayName ?? "?").replace(/^دکتر\s+/, "").slice(0, 1)}</span>}
                      <div>
                        <p className="pd-team__name">{m.displayName}</p>
                        <p className="pd-team__role">{m.displayTitle ?? (m.role === "VET" ? (fa ? "دامپزشک" : "Veterinarian") : fa ? "کارشناس" : "Specialist")}</p>
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
            <h2 id="pd-about">{fa ? "درباره" : "About"}</h2>
            {profile.description ? <p className="pd-prose">{profile.description}</p> : <p className="pd-muted">{fa ? "ارائه‌دهنده هنوز توضیحی ننوشته است." : "The provider has not added a description yet."}</p>}
            <dl className="pd-facts">
              <div><dt>{fa ? "حیوانات پذیرفته‌شده" : "Pets served"}</dt><dd>{profile.petTypes.length ? profile.petTypes.map((t) => (t === "DOG" ? (fa ? "سگ" : "Dogs") : fa ? "گربه" : "Cats")).join(fa ? " و " : " & ") : fa ? "ثبت نشده" : "Not stated"}</dd></div>
              <div><dt>{fa ? "خدمت در منزل" : "Home visits"}</dt><dd>{profile.homeVisit ? (fa ? "دارد" : "Available") : fa ? "ندارد" : "Not offered"}</dd></div>
              {!isVet && profile.specialties.length ? <div><dt>{fa ? "تخصص‌ها" : "Specialties"}</dt><dd>{profile.specialties.join(sep)}</dd></div> : null}
              {allRequest ? <div><dt>{fa ? "نوع رزرو" : "Booking"}</dt><dd>{fa ? "همهٔ نوبت‌ها پس از تأیید ارائه‌دهنده قطعی می‌شوند" : "Every booking is confirmed by the provider"}</dd></div> : null}
            </dl>
            {profile.galleryUrls.length ? (
              <ul className="pd-gallery" aria-label={fa ? "گالری" : "Gallery"}>
                {profile.galleryUrls.slice(0, 8).map((url) => (
                  <li key={url}><Image unoptimized src={url} alt="" fill sizes="25vw" /></li>
                ))}
              </ul>
            ) : null}
          </section>

          <section id="location" className="pd-section" aria-labelledby="pd-location">
            <h2 id="pd-location">{fa ? "مکان و تماس" : "Location and contact"}</h2>
            <ul className="pd-contact">
              {profile.locations.map((l) => (
                <li key={l.id}><MapPin size={16} aria-hidden="true" /><span>{[l.name, l.addressLine, l.region, l.city].filter(Boolean).join(sep)}</span></li>
              ))}
              {profile.phone ? <li><Phone size={16} aria-hidden="true" /><a href={`tel:${profile.phone}`} dir="ltr">{profile.phone}</a></li> : null}
            </ul>
            {profile.type === "VET_CLINIC" && profile.locations[0]?.city ? (
              <p className="pd-muted">
                {fa ? "در سفر هستید؟ " : "Travelling? "}
                <Link className="pd-link" href={`/${locale}/travel/search?city=${encodeURIComponent(profile.locations[0].city)}`}>{fa ? `اقامتگاه‌های دوستدار حیوانات در ${profile.locations[0].city}` : `Pet-friendly stays in ${profile.locations[0].city}`}</Link>
              </p>
            ) : null}
          </section>

          <section id="reviews" className="pd-section" aria-labelledby="pd-reviews">
            <h2 id="pd-reviews">{fa ? "نظر مشتریان" : "Customer reviews"}</h2>
            <div className="pd-review-summary">
              {profile.rating.count ? (
                <p className="pd-review-summary__score"><strong>{formatCount(profile.rating.average ?? 0, locale)}</strong><span>{fa ? `از ۵ · ${formatCount(profile.rating.count, "fa")} نظر` : `of 5 · ${profile.rating.count} ${profile.rating.count === 1 ? "review" : "reviews"}`}</span></p>
              ) : null}
              <p className="pd-review-summary__rule"><ShieldCheck size={16} aria-hidden="true" />{fa ? "فقط کسانی که نوبتشان انجام شده می‌توانند نظر بدهند." : "Only customers with a completed booking can review."}</p>
            </div>
            {profile.reviews.length ? (
              <ul className="pd-reviews">
                {profile.reviews.map((r) => (
                  <li key={r.id}>
                    <p className="pd-reviews__head">
                      <span className="pd-stars" aria-label={fa ? `${formatCount(r.rating, "fa")} از ۵` : `${r.rating} of 5`}>{"★".repeat(r.rating)}<span aria-hidden="true">{"★".repeat(5 - r.rating)}</span></span>
                      <strong>{r.authorName}</strong>
                      {r.serviceName ? <span>{r.serviceName}</span> : null}
                      <time dateTime={r.createdAt}>{new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium" }).format(new Date(r.createdAt))}</time>
                    </p>
                    {r.body ? <p className="pd-prose">{r.body}</p> : null}
                    {r.providerResponse ? <p className="pd-reviews__reply"><strong>{fa ? "پاسخ ارائه‌دهنده: " : "Provider response: "}</strong>{r.providerResponse}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pd-muted">{fa ? "هنوز نظری ثبت نشده است." : "No reviews yet."}</p>
            )}
          </section>

          {hasPolicies ? (
            <section id="policies" className="pd-section" aria-labelledby="pd-policies">
              <h2 id="pd-policies">{fa ? "قوانین و لغو" : "Policies and cancellation"}</h2>
              {profile.policiesText ? <p className="pd-prose">{profile.policiesText}</p> : null}
              <ul className="pd-policies">
                {profile.services.filter((s) => s.cancellationPolicy).map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    <span>{fa ? `لغو رایگان تا ${formatCount(s.freeCancellationHours, "fa")} ساعت قبل؛ پس از آن ${formatCount(s.lateCancellationRefundPercent, "fa")}٪ بازگشت وجه.` : `Free cancellation up to ${s.freeCancellationHours}h before; ${s.lateCancellationRefundPercent}% refund after that.`}</span>
                    <small>{s.cancellationPolicy}</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {profile.faqs.length ? (
            <section id="faq" className="pd-section" aria-labelledby="pd-faq">
              <h2 id="pd-faq">{fa ? "پرسش‌های پرتکرار" : "Frequently asked questions"}</h2>
              {profile.faqs.map((f) => (
                <details key={f.question} className="pd-faq">
                  <summary>{f.question}</summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="provider-book-panel" aria-label={fa ? "رزرو" : "Booking"}>
          <p className="provider-book-panel__type">{providerTypeLabel(profile.type, fa)}</p>
          <p className="provider-book-panel__name">{profile.name}</p>
          <ul>
            {profile.verified ? <li><BadgeCheck size={16} aria-hidden="true" />{fa ? "هویت و مجوز تأییدشده" : "Identity and license verified"}</li> : null}
            <li><Star size={16} aria-hidden="true" />{ratingText ?? (fa ? "هنوز نظری ثبت نشده" : "No reviews yet")}</li>
            {lowestPrice ? <li><span aria-hidden="true" className="provider-book-panel__dot" />{fa ? `از ${formatCurrency(lowestPrice, locale)}` : `From ${formatCurrency(lowestPrice, locale)}`}</li> : null}
          </ul>
          <Link href={bookHref()} className="provider-book-panel__cta">{fa ? "رزرو نوبت" : "Book an appointment"}</Link>
          <p className="provider-book-panel__note">{fa ? "مبلغ، پرداخت و قوانین لغو پیش از تأیید نهایی نمایش داده می‌شود." : "Price, payment and cancellation terms are shown before you confirm."}</p>
        </aside>
      </div>

      <div className="provider-sticky-cta" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="provider-sticky-cta__info">
          <strong>{profile.name}</strong>
          {lowestPrice ? <span>{fa ? `از ${formatCurrency(lowestPrice, locale)}` : `From ${formatCurrency(lowestPrice, locale)}`}</span> : null}
        </div>
        <Link href={bookHref()}>{fa ? "رزرو نوبت" : "Book an appointment"}</Link>
      </div>
    </article>
  );
}
