"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { BadgeCheck, Clock3, EmptyState, ErrorRecovery, House, MapPin, Phone, ShieldCheck, Skeleton, Star, Users } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { categoryLabel, paymentModeLabel, providerTypeLabel } from "./labels";
import { formatCount } from "@/lib/number/format-number";

/**
 * PUBLIC ENTITY DETAIL PATTERN: identity + trust header, section anchors, then About → Services →
 * Team → Location → Reviews → Policies → FAQ, with one persistent primary action (Book).
 * Every trust signal is real data: verification status, published reviews from completed
 * bookings, completed booking count. Nothing is shown when the provider has not supplied it.
 */
export function ProviderProfileView({ providerId }: { providerId: string }) {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");

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

  if (state === "loading") return <Skeleton className="h-[32rem] w-full" aria-label={fa ? "در حال بارگیری" : "Loading"} />;
  if (state === "notFound") return <EmptyState title={fa ? "این ارائه‌دهنده در دسترس نیست" : "This provider is not available"} description={fa ? "ممکن است هنوز تأیید نشده یا غیرفعال شده باشد." : "It may not be verified yet or may have been deactivated."} />;
  if (state === "error" || !profile) return <ErrorRecovery title={fa ? "پروفایل بارگیری نشد" : "Profile could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;

  const bookHref = (serviceId?: string) => `/${locale}/providers/${profile.id}/book${serviceId ? `?serviceId=${serviceId}` : ""}`;
  const sections = [
    { id: "about", fa: "درباره", en: "About" },
    { id: "services", fa: "خدمات", en: "Services" },
    ...(profile.team.length ? [{ id: "team", fa: "تیم", en: "Team" }] : []),
    { id: "location", fa: "مکان", en: "Location" },
    { id: "reviews", fa: "نظرات", en: "Reviews" },
    ...(profile.policiesText || profile.services.some((s) => s.cancellationPolicy) ? [{ id: "policies", fa: "قوانین", en: "Policies" }] : []),
    ...(profile.faqs.length ? [{ id: "faq", fa: "پرسش‌ها", en: "FAQ" }] : []),
  ];

  const lowestPrice = profile.services.map((sv) => sv.startingPrice).filter((p): p is number => !!p).sort((a, b) => a - b)[0] ?? null;
  return (
    <article className="provider-profile">
      <header className="flex flex-col gap-5 border-b border-border-subtle pb-6">
        {profile.coverImageUrl ? (
          <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg bg-surface-subtle">
            <Image unoptimized src={profile.coverImageUrl} alt="" fill sizes="(max-width:1024px) 100vw, 1024px" className="object-cover" priority />
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {profile.logoUrl ? <Image unoptimized src={profile.logoUrl} alt="" width={72} height={72} className="rounded-md border border-border-subtle object-cover" /> : null}
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary">{providerTypeLabel(profile.type, fa)}</p>
              <h1 className="text-page-title text-text-primary">{profile.name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1 text-brand-natural"><BadgeCheck size={16} aria-hidden="true" />{fa ? "هویت و مجوز تأییدشده توسط پت‌لایف" : "Identity and license verified by PET LIFE"}</span>
                {profile.rating.count ? (
                  <span className="inline-flex items-center gap-1"><Star size={15} aria-hidden="true" />{profile.rating.average?.toLocaleString(locale)} {fa ? `از ${profile.rating.count.toLocaleString(locale)} نظر` : `from ${profile.rating.count} reviews`}</span>
                ) : (
                  <span className="text-text-secondary">{fa ? "هنوز نظری ثبت نشده" : "No reviews yet"}</span>
                )}
                {profile.completedBookings ? <span className="text-text-secondary">{profile.completedBookings.toLocaleString(locale)} {fa ? "نوبت انجام‌شده در پت‌لایف" : "bookings completed on PET LIFE"}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <nav aria-label={fa ? "بخش‌های پروفایل" : "Profile sections"} className="-mx-1 flex gap-1 overflow-x-auto">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-text-secondary hover:bg-surface-subtle">{fa ? s.fa : s.en}</a>
          ))}
        </nav>
      </header>

      <section id="about" className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "درباره" : "About"}</h2>
        {profile.description ? <p className="whitespace-pre-line text-body text-text-primary">{profile.description}</p> : <p className="text-text-secondary">{fa ? "ارائه‌دهنده هنوز توضیحی ننوشته است." : "The provider has not added a description yet."}</p>}
        {profile.specialties.length ? (
          <ul className="flex flex-wrap gap-2" aria-label={fa ? "تخصص‌ها" : "Specialties"}>
            {profile.specialties.map((s) => <li key={s} className="experience-pill">{s}</li>)}
          </ul>
        ) : null}
        <p className="text-sm text-text-secondary">{fa ? "حیوانات پذیرفته‌شده: " : "Pets served: "}{profile.petTypes.map((t) => (t === "DOG" ? (fa ? "سگ" : "dogs") : fa ? "گربه" : "cats")).join(fa ? " و " : " & ")}{profile.homeVisit ? (fa ? " · خدمت در منزل" : " · home visits") : ""}</p>
        {profile.galleryUrls.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={fa ? "گالری" : "Gallery"}>
            {profile.galleryUrls.slice(0, 8).map((url) => (
              <li key={url} className="relative aspect-square overflow-hidden rounded-md bg-surface-subtle"><Image unoptimized src={url} alt="" fill sizes="25vw" className="object-cover" /></li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="services" className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "خدمات و قیمت‌ها" : "Services and prices"}</h2>
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {profile.services.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-text-primary">{s.name}</h3>
                  <p className="text-sm text-text-secondary">{categoryLabel(s.category, fa)} · <Clock3 size={13} aria-hidden="true" className="inline" /> {s.durationMinutes.toLocaleString(locale)} {fa ? "دقیقه" : "min"}{s.homeVisit ? <> · <House size={13} aria-hidden="true" className="inline" /> {fa ? "در منزل" : "At home"}</> : null}</p>
                </div>
                <div className="text-end">
                  <p className="font-bold">{s.startingPrice ? `${s.variants.length ? (fa ? "از " : "From ") : ""}${formatCurrency(s.startingPrice, locale)}` : fa ? "قیمت پس از استعلام" : "Price on request"}</p>
                  <p className="text-xs text-text-secondary">{paymentModeLabel(s.paymentMode, fa)}{s.bookingMode === "REQUEST" ? (fa ? " · نیازمند تأیید ارائه‌دهنده" : " · provider approval required") : fa ? " · رزرو فوری" : " · instant booking"}</p>
                </div>
              </div>
              {s.description ? <p className="text-sm text-text-primary">{s.description}</p> : null}
              {s.variants.length ? (
                <ul className="flex flex-wrap gap-2 text-sm" aria-label={fa ? "گزینه‌ها" : "Options"}>
                  {s.variants.map((v) => (
                    <li key={v.id} className="rounded border border-border-subtle px-3 py-1">{v.name} · {v.durationMinutes.toLocaleString(locale)} {fa ? "دقیقه" : "min"}{v.priceAmount ? ` · ${formatCurrency(v.priceAmount, locale)}` : ""}</li>
                  ))}
                </ul>
              ) : null}
              {s.preparationNotes ? <p className="text-sm text-text-secondary"><strong>{fa ? "آمادگی قبل از مراجعه: " : "Before you come: "}</strong>{s.preparationNotes}</p> : null}
              <div><Link href={bookHref(s.id)} className="inline-block rounded-md border border-brand-natural px-4 py-2 text-sm font-bold text-brand-natural">{fa ? "انتخاب این خدمت" : "Choose this service"}</Link></div>
            </li>
          ))}
        </ul>
      </section>

      {profile.team.length ? (
        <section id="team" className="flex flex-col gap-3">
          <h2 className="text-section-title inline-flex items-center gap-2"><Users size={20} aria-hidden="true" />{fa ? "تیم" : "Team"}</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {profile.team.map((m) => (
              <li key={m.providerUserId} className="flex gap-3 border-b border-border-subtle pb-4">
                {m.avatarUrl ? <Image unoptimized src={m.avatarUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle font-bold">{(m.displayName ?? "?").slice(0, 1)}</span>}
                <div>
                  <p className="font-bold">{m.displayName}</p>
                  <p className="text-sm text-text-secondary">{m.displayTitle ?? (m.role === "VET" ? (fa ? "دامپزشک" : "Veterinarian") : fa ? "کارشناس" : "Specialist")}</p>
                  {m.publicBio ? <p className="mt-1 text-sm">{m.publicBio}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="location" className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "مکان و تماس" : "Location and contact"}</h2>
        <ul className="flex flex-col gap-2">
          {profile.locations.map((l) => (
            <li key={l.id} className="flex items-start gap-2"><MapPin size={16} aria-hidden="true" className="mt-1" /><span>{[l.name, l.addressLine, l.region, l.city].filter(Boolean).join("، ")}</span></li>
          ))}
        </ul>
        {profile.phone ? <p className="inline-flex items-center gap-2"><Phone size={16} aria-hidden="true" /><span dir="ltr">{profile.phone}</span></p> : null}
        {profile.type === "VET_CLINIC" && profile.locations[0]?.city ? (
          <p className="text-sm text-text-secondary">
            {fa ? "در سفر هستید؟ " : "Travelling? "}
            <Link className="underline" href={`/${locale}/travel/search?city=${encodeURIComponent(profile.locations[0].city)}`}>{fa ? `اقامتگاه‌های دوستدار حیوانات در ${profile.locations[0].city}` : `Pet-friendly stays in ${profile.locations[0].city}`}</Link>
          </p>
        ) : null}
      </section>

      <section id="reviews" className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "نظر مشتریان" : "Customer reviews"}</h2>
        <p className="inline-flex items-center gap-2 text-sm text-text-secondary"><ShieldCheck size={16} aria-hidden="true" />{fa ? "فقط کسانی که نوبتشان انجام شده می‌توانند نظر بدهند." : "Only customers with a completed booking can review."}</p>
        {profile.reviews.length ? (
          <ul className="divide-y divide-border-subtle">
            {profile.reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-4">
                <p className="text-sm"><span aria-label={fa ? `${formatCount(r.rating, "fa")} از ۵` : `${r.rating} of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> · {r.authorName}{r.serviceName ? ` · ${r.serviceName}` : ""} · <time dateTime={r.createdAt}>{new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium" }).format(new Date(r.createdAt))}</time></p>
                {r.body ? <p className="text-body">{r.body}</p> : null}
                {r.providerResponse ? <p className="border-s-2 border-brand-natural ps-3 text-sm text-text-secondary"><strong>{fa ? "پاسخ ارائه‌دهنده: " : "Provider response: "}</strong>{r.providerResponse}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-secondary">{fa ? "هنوز نظری ثبت نشده است." : "No reviews yet."}</p>
        )}
      </section>

      {profile.policiesText || profile.services.some((s) => s.cancellationPolicy) ? (
        <section id="policies" className="flex flex-col gap-3">
          <h2 className="text-section-title">{fa ? "قوانین و لغو" : "Policies and cancellation"}</h2>
          {profile.policiesText ? <p className="whitespace-pre-line">{profile.policiesText}</p> : null}
          <ul className="flex flex-col gap-2 text-sm">
            {profile.services.filter((s) => s.cancellationPolicy).map((s) => (
              <li key={s.id}><strong>{s.name}: </strong>{s.cancellationPolicy} ({fa ? `لغو رایگان تا ${s.freeCancellationHours.toLocaleString(locale)} ساعت قبل؛ پس از آن ${s.lateCancellationRefundPercent.toLocaleString(locale)}٪ بازگشت وجه` : `free cancellation up to ${s.freeCancellationHours}h before; ${s.lateCancellationRefundPercent}% refund after that`})</li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.faqs.length ? (
        <section id="faq" className="flex flex-col gap-3">
          <h2 className="text-section-title">{fa ? "پرسش‌های پرتکرار" : "Frequently asked questions"}</h2>
          {profile.faqs.map((f) => (
            <details key={f.question} className="border-b border-border-subtle py-3">
              <summary className="cursor-pointer font-bold">{f.question}</summary>
              <p className="mt-2">{f.answer}</p>
            </details>
          ))}
        </section>
      ) : null}

      <aside className="provider-book-panel" aria-label={fa ? "رزرو" : "Booking"}>
        <p className="provider-book-panel__type">{providerTypeLabel(profile.type, fa)}</p>
        <p className="provider-book-panel__name">{profile.name}</p>
        <ul>
          <li><BadgeCheck size={16} aria-hidden="true" />{fa ? "هویت و مجوز تأییدشده" : "Identity and license verified"}</li>
          <li><Star size={16} aria-hidden="true" />{profile.rating.count ? (fa ? `${profile.rating.average?.toLocaleString(locale)} از ${profile.rating.count.toLocaleString(locale)} نظر` : `${profile.rating.average} from ${profile.rating.count} reviews`) : fa ? "هنوز نظری ثبت نشده" : "No reviews yet"}</li>
          {lowestPrice ? <li><span aria-hidden="true" className="provider-book-panel__dot" />{fa ? `از ${formatCurrency(lowestPrice, locale)}` : `From ${formatCurrency(lowestPrice, locale)}`}</li> : null}
        </ul>
        <Link href={bookHref()} className="provider-book-panel__cta">{fa ? "رزرو نوبت" : "Book an appointment"}</Link>
        <p className="provider-book-panel__note">{fa ? "پرداخت و قوانین لغو پیش از تأیید نهایی نمایش داده می‌شود." : "Payment and cancellation terms are shown before you confirm."}</p>
      </aside>

      <div className="provider-sticky-cta" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <Link href={bookHref()}>{fa ? "رزرو نوبت" : "Book an appointment"}</Link>
      </div>
    </article>
  );
}
